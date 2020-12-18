const WebSocket = require('ws');

//See https://www.npmjs.com/package/commander
const { program } = require('commander');

program.option('-f, --function <function>', 'The serveless function to run')
        .option('-p, --port <port>', 'The websocket port to use', 7272)
        .option('-s, --stage <stage>', 'The stage to use', "staging");

program.parse(process.argv);
var uuid = require("montage/core/uuid");
// var Montage = require('montage/montage'),
//     PATH = require("path"),
//     uuid = require("montage/core/uuid"),
var functionPath = program.function,
    port = program.port,
    functionModuleId,
    functionModuledDirName,
    functionModule,
    OperationCoordinatorPromise;

// //From Montage
// Load package

functionModuledDirName = functionPath.substring(0,functionPath.lastIndexOf("/"));

if(functionPath.endsWith(".js")) {
    functionModuleId = functionPath.substring(0,functionPath.length-3);
    // functionModuleId = functionPath.substring(functionPath.lastIndexOf("/")+1,functionPath.length-3);
}

// OperationCoordinatorPromise = Montage.loadPackage(PATH.join(__dirname, "."), {
//     mainPackageLocation: PATH.join(__filename, ".")
// })
// OperationCoordinatorPromise = Montage.loadPackage(PATH.join(functionModuledDirName, "."), {
//     mainPackageLocation: PATH.join(functionPath, ".")
// })
// .then(function (mr) {
//     return mr.async(functionModuleId);
// })
// .then(function (_functionModule) {
//     //Returns a promise to the worker
//     functionModule = _functionModule;
//     return functionModule.worker;
// })
functionModule = require(functionModuleId);

functionModule.worker.then(function (worker) {

    const wss = new WebSocket.Server({ port: port });

    wss.on('connection', function connection(ws, req) {

        const ip = req ? req.socket.remoteAddress: "127.0.0.1";
        const headers = req.headers;
        const userAgent = headers["user-agent"];
        /*
            When the server runs behind a proxy like NGINX, the de-facto standard is to use the X-Forwarded-For header.
        */
       //const ip = req.headers['x-forwarded-for'].split(/\s*,\s*/)[0];


        var mockGateway =  {
            postToConnection: function(params) {
                this._promise = new Promise(function(resolve,reject) { 
                    /* params looks like:
                        {
                            ConnectionId: event.requestContext.connectionId,
                            Data: self._serializer.serializeObject(readOperationCompleted)
                        }
                    */
                var serializedHandledOperation = params.Data;
                ws.send(serializedHandledOperation);
                resolve(true);
    
                });
                return this;
            },
            promise: function() {
                return this._promise;
            }
        };

        //Overrides with our dev equivalent
        worker.apiGateway = mockGateway;
        
        var mockContext,
        mockCallback = function(){};

        //Needs to inject stage property for phront service to use the right info
        functionModule.connect( {
                requestContext: {
                    connectionId: uuid.generate(),
                    stage: program.stage,
                    identity: {
                        sourceIp: ip,
                        userAgent: userAgent
                    }
                },
                "headers": headers,
                "body":""
            },
            mockContext,
            mockCallback
        );    


    
        ws.on('message', function incoming(message) {
            var mockDefaultContext = {},
            mockDefaultCallback = function(){};

            functionModule.default( {
                    requestContext: {
                        connectionId: uuid.generate(),
                        stage: program.stage,
                        identity: {
                            sourceIp: ip,
                            userAgent: userAgent
                        }
                    },
                    "headers": headers,
                    "body":message
                },
                mockDefaultContext,
                mockDefaultCallback
            );    
          
                //console.log('received: %s', message);
        });
     
        //ws.send('something');
    });

});

