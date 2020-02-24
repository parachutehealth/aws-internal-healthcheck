'use strict';

const AWS = require('aws-sdk');
const cloudwatch = new AWS.CloudWatch({apiVersion: '2013-02-22', region: 'us-east-1'});

var conf = {
    protocol : process.env.PROTOCOL || 'http',
    host: process.env.HOSTNAME || 'localhost',
    port: process.env.PORT || ((process.env.PROTOCOL === 'https')?'443':'80'),
    path: process.env.URL_PATH || '',
    stringMatching: process.env.STRING_MATCHING,
    invertHealthCheckStatus: process.env.INVERT_HEALTHCHECK_STATUS === 'true' || false,
    metricName : process.env.METRIC_NAME || 'MyService',
    metricNameSpace : process.env.METRIC_NAMESPACE || 'HealthCheck',
    metricEnvironment: process.env.METRIC_ENVIRONMENT,
    timeout: process.env.TIMEOUT || 10
}

var url = `${conf.protocol}://${conf.host}:${conf.port}${conf.path}`;
const http = conf.protocol === 'https' ? require('follow-redirects').https : require('follow-redirects').http;

exports.handler = (event, context, callback) => {
    console.log(`Checking ${url}`);
    if (callback === undefined) {
        callback = console.log
    }

    var req = http.get(url, res => {
        if (conf.stringMatching) {
            console.log("String Matching...");
            let body = '';
            res.on('data', chunk => {
                body += chunk
            });
            res.on('end', chunk => {
                if (body.includes(conf.stringMatching)) {
                    ProcessStatus (true, res.statusCode, "string found in body", callback)
                } else {
                    ProcessStatus (false, res.statusCode, new Error(`cannot find string in response: '${conf.stringMatching}'`), callback)
                }
            })
        } else {
            console.log("No String Matching...")
            if (res.statusCode >= 200 && res.statusCode < 400 ) {
                console.log("Good Response Code");
                ProcessStatus (true, res.statusCode, null, callback)
            } else {
                console.log("Bad Response Code");
                ProcessStatus (false, res.statusCode, new Error(`${res.statusMessage}`), callback)
            }
        }
    });
    req.on('error', e => {
        console.log("Request Error", e);
        ProcessStatus (false, null, e, callback)
    });
    req.on('socket',function(socket){
        console.log("Request Socket");
        socket.setTimeout(conf.timeout * 1000 - 500,function(){
            console.log("Aborting the request.");
            req.abort();
        })
    })
};

var ProcessStatus = (statusOK, statusCode, err, cb) => {
    let isOK = conf.invertHealthCheckStatus ? !statusOK: statusOK;
    let metrics = {
        MetricData : [
            {
                MetricName: conf.metricName,
                Dimensions: [
                    {
                      Name: 'Domain',
                      Value: conf.host
                    },
                    {
                      Name: "Environment",
                      Value: conf.metricEnvironment
                    }
                ],
                Value: isOK ? 1: 0
            }
        ],
        Namespace: conf.metricNameSpace,
    }
    cloudwatch.putMetricData(metrics, (errcw, data) => {
        if (errcw) {
            cb(errcw, data)
        }
        console.log("data:", data);
        let res = `Healthcheck ${isOK ? 'OK': 'KO'} : ${statusCode || ''} ${err || ''}`;
        console.log("response:", res);
        cb(null,res)
    })
};
