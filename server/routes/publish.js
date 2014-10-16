// POST /publish
// req.body should contain id, which represents appID
// session should contain a user
var habitat = require('habitat');
var AWS = require('aws-sdk');
var async = require('async');

var makedrive = require('../../lib/makedrive');
var errorUtil = require('../../lib/error');
var s3Util = require('../../lib/s3');

var docsUrl = 'https://github.com/mozillafordevelopment/webmaker-app-publisher';
var baseDir = 'p';

module.exports = function (req, res, next) {

    if (!req.session || !req.session.user) return next(errorUtil(401, 'No user session found'));
    var username = req.session.user.username;
    var appId = req.body.id;

    if (!username) return next(errorUtil(401, 'No valid user session found'));
    if (!appId) return next(errorUtil(400, 'No id in request body. See docs at ' + docsUrl));

    makedrive.getUserJSON(username, function (err, data) {
        if (err) return next(err);

        var json;
        for (var i in data.apps) {
            if (data.apps[i].id === appId) json = data.apps[i];
        }

        if (!json) return next(errorUtil(404, 'App not found for id: ' + appId));

        var dir = baseDir + '/' + username + '/' + json.id;

        // Convert json to js to write to file
        var appJs = 'window.App=' + JSON.stringify(json) + ';';

        // Queue up generic file uploads
        // Todo: copy these directly from webmaker-app s3 bucket to new s3 dir
        var queue = [
            '../src/index.html',
            '../src/index.js',
            '../src/common.css'
        ].map(function (filepath) {
            return function (cb) {
                s3Util.copyPublishAssets({filepath: filepath, dir: dir}, cb);
            };
        });

        // Add the json
        queue.push(function (callback) {
            s3.putObject({
                Key: dir + '/app.js',
                Body: appJs,
                ContentType: 'application/javascript',
            }, callback);
        });

        // Do it!
        async.parallel(queue, function (err, results) {
            if (err) return next(err);
            // Send the url
            res.send({
                url: habitat.get('PUBLISH_URL') + '/' + dir,
                result: results
            });
        });
    });

};
