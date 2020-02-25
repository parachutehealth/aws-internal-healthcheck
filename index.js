'use strict';

const fs = require("fs");
const AWS = require('aws-sdk');
const cloudwatch = new AWS.CloudWatch({apiVersion: '2013-02-22', region: 'us-east-1'});

var conf = {
    protocol : process.env.PROTOCOL || 'http',
    host: process.env.HOSTNAME || 'localhost',
    port: process.env.PORT || ((process.env.PROTOCOL === 'https')?'443':'80'),
    path: process.env.URL_PATH || '/',
    caCertPath: process.env.CA_CERT_PATH,
    invertHealthCheckStatus: process.env.INVERT_HEALTHCHECK_STATUS === 'true' || false,
    metricName : process.env.METRIC_NAME || 'MyService',
    metricNameSpace : process.env.METRIC_NAMESPACE || 'HealthCheck',
    metricEnvironment: process.env.METRIC_ENVIRONMENT,
    timeout: process.env.TIMEOUT || 10
};

var url = `${conf.protocol}://${conf.host}:${conf.port}${conf.path}`;
const http = conf.protocol === 'https' ? require('https') : require('http');

exports.handler = (event, context, callback) => {
    console.log(`Checking ${url}`);

    const options = {
        hostname: conf.host,
        port: conf.port,
        path: conf.path,
        method: 'GET',
    };
    if ( conf.protocol === 'https' && conf.caCertPath ) {
        options['ca'] = fs.readFileSync(conf.caCertPath);
    }

    http.request(options, res => {
        res.on('data', data => {
            if (res.statusCode >= 200 && res.statusCode < 400 ) {
                ProcessStatus (true, res.statusCode, null, callback)
            } else {
                ProcessStatus (false, res.statusCode, new Error(`${res.statusMessage}`), callback)
            }
        });
        res.on('error', e => {
            console.log("Request Error", e);
            ProcessStatus (false, null, e, callback)
        });
        res.on('socket',function(socket){
            socket.setTimeout(conf.timeout * 1000 - 500,function(){
                console.log("Aborting the request - Timeout.");
                req.abort();
            })
        })
    }).end();

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
