const handle = require('./index');

function myLog(a, b){
    console.log("MyLog", a, b)
}

console.log(handle.handler({}, {}, myLog ));

console.log(handle.handler({} ));