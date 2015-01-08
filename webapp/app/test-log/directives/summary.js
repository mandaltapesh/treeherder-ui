/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

testLog.directive('lvLogSteps', ['$timeout', '$q', function ($timeout, $q) {

    return {
        restrict: 'A',
        templateUrl: 'summary.html',
        link: function (scope, element, attr) {


            scope.toggleWarnings = function() {
                scope.showWarnings = !scope.showWarnings;

                var firstError = scope.artifact.step_data.steps.filter(function(step){
                    return step.result && step.result !== "success";
                })[0];

                if (!firstError) { return; }

                // scroll to the first error
                $timeout(function () {
                    var scrollTop = getOffsetOfStep(firstError.order);

                    $('.steps-data').scrollTop( scrollTop );
                });
            };

            /**
             * Triggered when you click on a log line in the summary to load
             * the log chunk, or scroll to it.
             */
            scope.displayLog = function(line) {

                scope.currentLineNumber = line.serial;

                scope.loadMore({}).then(function () {
                    $timeout(function () {
                        var raw = $('.lv-log-container')[0];
                        var selectedLine = $('.lv-log-line[line="' + line.serial + '"]');
                        raw.scrollTop += selectedLine .offset().top - $('.run-data').outerHeight() - 15 ;
                    });
                });
            };
        }
    };
}]);
