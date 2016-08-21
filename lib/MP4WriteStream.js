/**
 * Created by igors on 3/13/16.
 */


var path = require('path');
var os = require('os');
var fs = require('fs');
var util = require('util');
var Writable = require('stream').Writable;
var config = require('./../common/Configuration');
var qio = require('q-io/fs');
var persistenceFormat = require('./../common/PersistenceFormat');
var loggerModule = require('../common/logger');
var _ = require('underscore');

function getArchAndPlatform()
{
    if (os.platform() === 'win32')
    {
        if (os.arch() === 'x64')
        {
            return "win64";
        }
        else
        {
            return "win32";
        }
    } else if (os.platform() === 'darwin') {
        return "darwin";
    }
    else
    {
        return "linux";
    }
}

var nativeTS2MP4 = require(path.join(__dirname, '..', 'bin', getArchAndPlatform(), 'FormatConverter.node'));
nativeTS2MP4.Configure({ logLevel:'warn'});

var ConversionError = function(strErr,chunkName){
    Error.prototype.constructor.call(this);
    this.message = strErr;
    this.chunkName = chunkName;
};

util.inherits(ConversionError, Error);

var MP4WriteStream = (function(){
    function MP4WriteStream(chunkPath, loggerInfo) {

        var that = this;

        that.logger = loggerModule.getLogger("MP4WriteStream", loggerInfo);
        that.chunkPath = chunkPath;

        that.savedChunk = config.get('preserveOriginalChunk') ? fs.createWriteStream(chunkPath + '_saved.ts') : undefined;

        if(that.savedChunk){
            that.savedChunk.on('error', function () {
                that.savedChunk.close();
            })
                .on('end', function () {
                    that.savedChunk.close();
                })
                .on('finish',function(){
                    that.savedChunk.end();
                });
        }

        that.chunks = [];

        Writable.call(that,{
            decodeStrings: true,
            objectMode: false,
            highWaterMark: 1024 * 1024

        });

        that.addListener('finish',function(){
            onFinish.call(that);
        });

        return that;
    }

    return MP4WriteStream;

})();

util.inherits(MP4WriteStream, Writable);


MP4WriteStream.prototype._write = function (chunk, encoding, callback) {
    var that = this;

   // that.logger.debug("MP4Writer._write chunk len " + chunk.length);

    that.chunks.push(chunk);
    if(that.savedChunk){
        that.savedChunk.write(chunk);
    }
    callback();
};

var onError = function (errStr) {
    var that = this;

    that.logger.debug("onError %j conversion error: %j", that.chunkPath, errStr);
    if(that.ws) {
        that.ws.close();
    }
    fs.unlink(that.chunkPath, function(){
        that.emit('error',new ConversionError(errStr,path.basename(that.chunkPath)));
    });
};

var onData = function (mp4Data) {
    var that = this;

    if(mp4Data == null){
        return;
    }
    //that.logger.debug("onData %d", mp4Data.length);
    try {
        that.ws.write(mp4Data);
    } catch(err){
        onError.call(that,err);
    }
};

var onEnd = function (fileInfo) {
    var that = this;

    that.logger.trace("onEnd %j", fileInfo);
    that.ws.on('finish', function () {
        fileInfo.path = that.chunkPath;
        that.emit('end', fileInfo);
        that.logger.trace("Completed ts2mp4 conversion");
    }).end();
};

var onFinish = function() {
    var that = this;

    if(that.savedChunk){
        that.savedChunk.end();
    }

    if(!that.chunks.length){
        onError.call(that,'empty ts chunk!');
        return;
    }

    that.logger.trace("onFinish. Create converter ");
    var converter = new nativeTS2MP4.TS2MP4Convertor();

    try {
        that.chunkPath = path.join(path.dirname(that.chunkPath),persistenceFormat.getMP4FileNamefromInfo(that.chunkPath));
        that.logger.trace("onFinish. Attempt to open file %j",that.chunkPath);
        that.ws = fs.createWriteStream(that.chunkPath);
        that.ws.on('error', function (err) {
            that.ws.close();
            onError.call(that,err);
        })
            .on('end', function () {
                that.ws.close();
            });
    } catch(err){
        onError.call(that,err);
        return;
    }

    var buf = Buffer.concat(that.chunks);
    try {
        converter.on('data', onData,that)
            .on('end', onEnd,that)
            .on('error', onError,that)
            .push(buf)
            .end();
    } catch(err){
        onError.call(that,err);
    }
};

module.exports.MP4WriteStream = MP4WriteStream;
module.exports.ConversionError = ConversionError;