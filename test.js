const handle = require('./index');

function myLog(a, b){
    console.log("MyLog:", a, b)
}

function myCertLog(a, b){
    console.log("MyCertLog: ", a, b)
}

console.log(handle.handler({}, {}, myLog ));

console.log(handle.certHandler({}, {}, myCertLog ));

