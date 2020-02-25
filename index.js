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
    metricName : process.env.METRIC_NAME || 'MyService',
    metricNameSpace : process.env.METRIC_NAMESPACE || 'HealthCheck',
    metricEnvironment: process.env.METRIC_ENVIRONMENT,
    timeout: process.env.TIMEOUT || 10
};

var url = `${conf.protocol}://${conf.host}:${conf.port}${conf.path}`;
const http = conf.protocol === 'https' ? require('https') : require('http');

exports.certHandler = (event, context, callback) => {
    console.log(`Checking Cert on ${url}`);

    if (conf.protocol != 'https' || conf.port != '443') {
        var msg = 'Skipping Cert Handler. Non HTTPS request.';
        console.log(msg);
        callback(msg, 0);
        return;
    }

    const options = {
        hostname: conf.host,
        port: conf.port,
        path: "/",
        method: 'GET',
    };
    if ( conf.caCertPath ) {
        options['ca'] = fs.readFileSync(conf.caCertPath);
    }

    var req = http.request(options, res => {
        var certificate = res.connection.getPeerCertificate();
        var expirationDate = Date.parse(certificate.valid_to);
        const oneDay = 24 * 60 * 60 * 1000;
        var today = Date.now();
        var daysRemaining = Math.round(Math.abs((expirationDate - today) / oneDay));
        ProcessStatus (true, daysRemaining, null, callback)
    }).end();
    req.on('error', e => {
        console.log("Request Error", e);
        ProcessStatus (false, 0, e, callback)
    });
    req.on('socket',function(socket){
        socket.setTimeout(conf.timeout * 1000 - 500,function(){
            console.log("Aborting the request - Timeout.");
            req.abort();
        })
    })
};

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

    var req = http.request(options, res => {
        res.on('data', data => {
            if (res.statusCode >= 200 && res.statusCode < 400 ) {
                ProcessStatus (true, 1, null, callback)
            } else {
                ProcessStatus (false, 0, new Error(`${res.statusMessage}`), callback)
            }
        });
    }).end();
    req.on('error', e => {
        console.log("Request Error", e);
        ProcessStatus (false, 0, e, callback)
    });
    req.on('socket',function(socket){
        socket.setTimeout(conf.timeout * 1000 - 500,function(){
            console.log("Aborting the request - Timeout.");
            req.abort();
        })
    })
};

var ProcessStatus = (statusOK, reportValue, err, cb) => {
    let metricValue = statusOK ? reportValue : 0;
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
                Value: metricValue
            }
        ],
        Namespace: conf.metricNameSpace,
    }
    cloudwatch.putMetricData(metrics, (errcw, data) => {
        if (errcw) {
            cb(errcw, data)
        }
        console.log("data:", data);
        let res = `Healthcheck ${statusOK ? 'OK': 'KO'} : ${metricValue} ${err || ''}`;
        console.log("response:", res);
        cb(null,res)
    })
};
