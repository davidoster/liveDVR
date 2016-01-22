/**
 * Created by elad.benedict on 1/22/2016.
 */

var path = require('path');
var _ = require('underscore');
var Q = require('q');

module.exports = (function(){

    var populateFlavorData = function populateFlavorData(fdp, flavorData, flavorVideoData, flavorAudioData)
    {
        if (fdp.nginxInput_video)
        {
            flavorVideoData.paths = _.pluck(fdp.nginxInput_video.sequences[0].clips, 'path');
            flavorVideoData.durations = fdp.nginxInput_video.durations;
            flavorData.clips[0].sources.push(flavorVideoData)
        }

        if (fdp.nginxInput_audio)
        {
            flavorAudioData.paths = _.pluck(fdp.nginxInput_audio.sequences[0].clips, 'path');
            flavorAudioData.durations = fdp.nginxInput_audio.durations;
            flavorData.clips[0].sources.push(flavorAudioData)
        }

        return flavorData;
    }

    var generateInput = function (flavorDataProviders){
        return Q.fcall(function(){
            var resTemplate = {
                "playlistType": "live",
                "discontinuity": false,
                "durations": [],
                "sequences": []
            }

            var flavorTemplate = {
                "clips": [
                    {
                        "type": "mixFilter",
                        "sources": []
                    }
                ]
            }

            var videoStreamTemplate = {
                "type": "concat",
                "tracks": "v1",
                "paths": [],
                "durations": []
            }

            var audioStreamTemplate = {
                "type": "concat",
                "tracks": "a1",
                "paths": [],
                "durations": []
            }


            _.chain(flavorDataProviders)
                .filter(function(fdp){
                    return fdp.nginxInput_audio || fdp.nginxInput_video;
                })
                .each(function(fdp){
                    var flavorData = JSON.parse(JSON.stringify(flavorTemplate));
                    var flavorVideoData = JSON.parse(JSON.stringify(videoStreamTemplate));
                    var flavorAudioData = JSON.parse(JSON.stringify(audioStreamTemplate));
                    var flavorResultData = populateFlavorData(fdp, flavorData, flavorVideoData, flavorAudioData);

                    flavorOverallVideoDuration =
                        fdp.nginxInput_video
                            ? _.reduce(fdp.nginxInput_video.durations, function(m,n){ return m+n;}, 0)
                            : Number.MAX_VALUE;
                    flavorOverallAudioDuration =
                        fdp.nginxInput_audio
                            ? _.reduce(fdp.nginxInput_audio.durations, function(m,n){ return m+n;}, 0)
                            : Number.MAX_VALUE;

                    resTemplate.durations.push(Math.min(flavorOverallVideoDuration, flavorOverallAudioDuration));
                    resTemplate.sequences.push(flavorResultData);
                })

            return resTemplate;
        })
    }

    return {
        generateInput : generateInput
    };
})();