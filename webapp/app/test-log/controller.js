/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

testLog.controller('TestLogCtrl', [
    '$anchorScroll', '$http', '$location', '$q', '$rootScope', '$scope',
    '$timeout', 'ThJobArtifactModel', 'ThLog', 'ThLogSliceModel',
    function TestLogCtrl(
        $anchorScroll, $http, $location, $q, $rootScope, $scope,
        $timeout, ThJobArtifactModel, ThLog, ThLogSliceModel) {

        var $log = new ThLog('TestLogCtrl');

        // changes the size of chunks pulled from server
        var LINE_BUFFER_SIZE = 100;
        var LogSlice;

        $rootScope.urlBasePath = $location.absUrl().split('logviewer')[0];

        var query_string = $location.search();
        if (query_string.repo !== "") {
            $rootScope.repoName = query_string.repo;
        }
        if (query_string.job_id !== "") {
            $scope.job_id= query_string.job_id;
            LogSlice = new ThLogSliceModel($scope.job_id, LINE_BUFFER_SIZE);
        }

        $scope.displayedLogLines = [];
        $scope.linesLoading = false;
        $scope.logError = false;
        $scope.currentLineNumber = 0;
        $scope.highestLine = 0;
        $scope.showSuccessful = true;

        $scope.$watch('artifact', function () {
            if (!$scope.artifact) {
                return;
            }
//            $scope.showSuccessful = !$scope.hasWarnings();
        });

//        $scope.hasWarnings = function () {
//            var steps = $scope.artifact.step_data.steps;
//            for (var i = 0; i < steps.length; i++) {
//                // We only recently generated step results as part of ingestion,
//                // so we have to check the results property is present.
//                // TODO: Remove this when the old data has expired, so long as
//                // other data submitters also provide a step result.
//                if ('result' in steps[i] && steps[i].result !== "success") {
//                    return true;
//                }
//            }
//            return false;
//        };

        $scope.loadMore = function(bounds, element) {
            var deferred = $q.defer(), range, req, above, below;

            if (!$scope.linesLoading) {
                // move the line number either up or down depending which boundary was hit
                $scope.currentLineNumber = moveLineNumber(bounds);

                range = {
                    start: $scope.currentLineNumber,
                    end: $scope.currentLineNumber
                };

                if (bounds.top) {
                    above = getChunkAbove(range);
                } else if (bounds.bottom) {
                    below = getChunkBelow(range);
                } else {
                    range = getChunksSurrounding($scope.currentLineNumber);
                }

                // dont do the call if we already have all the lines
                if ( range.start === range.end ) {
                    return deferred.promise;
                }

                $scope.linesLoading = true;

                LogSlice.get_line_range({
                    job_id: $scope.job_id,
                    start_line: range.start,
                    end_line: range.end,
                    name: "structured-raw",
                    format: "json"
                }, {
                    buffer_size: LINE_BUFFER_SIZE
                }).then(function(data) {
                    var slicedData, length;


                    if (bounds.top) {
                        for (var i = data.length - 1; i >= 0; i--) {
                            // make sure we are inserting at the right place
                            if ($scope.displayedLogLines[0].index !== data[i].index + 1) {
                                continue;
                            }
                            $scope.displayedLogLines.unshift(data[i]);
                        }

                        $timeout(function () {
                            if (above) {
                                removeChunkBelow();
                            }
                        }, 100);
                    } else if (bounds.bottom) {
                        var sh = element.scrollHeight;
                        var lines = $scope.displayedLogLines;

                        for (var j = 0; j < data.length; j++) {
                            // make sure we are inserting at the right place
                            if (lines[ lines.length - 1 ].index !== data[j].index - 1) {
                                continue;
                            }
                            $scope.displayedLogLines.push(data[j]);
                        }

                        $timeout(function () {
                            if (below) {
                                removeChunkAbove();
                                element.scrollTop -= element.scrollHeight - sh;
                            }
                        }, 100);
                    } else {
                        $scope.displayedLogLines = data;
                    }

                    console.log("displayedLogLines", $scope.displayedLogLines);
                    $scope.linesLoading = false;
                    deferred.resolve();
                }, function (error) {
                    $scope.linesLoading = false;
                    $scope.logError = true;
                    deferred.reject();
                });
            } else {
                deferred.reject();
            }

            return deferred.promise;
        };

        $scope.init = function() {
            $log.log(ThJobArtifactModel.get_uri());

            // load just the metadata in the same way as the old logviewer
            ThJobArtifactModel.get_list({job_id: $scope.job_id, name__in: 'Structured Log,faults'})
            .then(function(artifactList){
                if(artifactList.length > 0){
                    $scope.artifact = _.findWhere(artifactList, {name: 'Structured Log'}).blob;
                    $scope.summaryLines = _.findWhere(artifactList, {name: 'faults'}).blob.all_errors;

                    var revision = $scope.artifact.header.revision.substr(0,12);
                    $scope.logRevisionFilterUrl = $scope.urlBasePath +
                        "#/jobs?repo=" + $scope.repoName + "&revision=" + revision;

                    // Store the artifact epoch date string in a real date object for use
                    var startTime = $scope.artifact.header.starttime;
                    var startDate = new Date(0);
                    startDate.setUTCSeconds(startTime);

                    $scope.logDisplayDate = startDate.toString();

                    ThJobArtifactModel.get_list(
                        {job_id: $scope.job_id, name:'buildapi'})
                    .then(function(buildapiData){
                        if(buildapiData.length > 0){
                            $scope.artifact.header.builder = buildapiData[0].blob.buildername;

                            // Used with ng-bind to avoid template flicker
                            $scope.getLogviewerTitle = function() {
                                var ahb = $scope.artifact.header.builder;
                                return "Log viewer - " + ahb;
                            };
                        }
                    });
                }
            });
        };




        /** utility functions **/

        function transformStructuredLogToJson(data) {
            // transform the json lines on each line to a single json obj
            var lines = data.trim().split("\n");
            return JSON.parse('[' + lines.join(",") + ']');
        }

        function logFileLineCount () {
            var steps = $scope.artifact.step_data.steps;
            return steps[ steps.length - 1 ].finished_linenumber;
        }

        function moveLineNumber (bounds) {
            var lines = $scope.displayedLogLines, newLine;

            if (bounds.top) {
                console.log("bounds top lines", bounds, lines.length);
                if (lines.length) {
                    var thisone = lines[0];
                    return thisone.index;
                } else {
                    console.log("we didn't have any lines");
                }
            } else if (bounds.bottom) {
                newLine = lines[lines.length - 1].index + 1;
                return (newLine > logFileLineCount()) ? logFileLineCount(): newLine;
            }

            return $scope.currentLineNumber;
        }

        function getChunksSurrounding(line) {
            var request = {start: null, end: null};

            getChunkContaining(line, request);
            getChunkAbove(request);
            getChunkBelow(request);

            return request;
        }

        function getChunkContaining (line, request) {
            var index = Math.floor(line/LINE_BUFFER_SIZE);

            request.start = index * LINE_BUFFER_SIZE;
            request.end = (index + 1) * LINE_BUFFER_SIZE;
        }

        function getChunkAbove (request) {
            request.start -= LINE_BUFFER_SIZE;
            request.start = Math.floor(request.start/LINE_BUFFER_SIZE)*LINE_BUFFER_SIZE;

            if (request.start >= 0) {
                return true;
            } else {
                request.start = 0;
                return false;
            }
        }

        function getChunkBelow (request) {
            var lastLine = 20000;

            request.end += LINE_BUFFER_SIZE;
            request.end = Math.ceil(request.end/LINE_BUFFER_SIZE)*LINE_BUFFER_SIZE;

            if (request.end <= lastLine) {
                return true;
            } else {
                request.end = lastLine;
                return false;
            }
        }

        function removeChunkAbove (request) {
            $scope.displayedLogLines = $scope.displayedLogLines.slice(LINE_BUFFER_SIZE);
        }

        function removeChunkBelow (request) {
            var endSlice = $scope.displayedLogLines.length - LINE_BUFFER_SIZE;
            $scope.displayedLogLines = $scope.displayedLogLines.slice(0, endSlice);
        }
    }
]);
