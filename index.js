const http = require('http');
const WebSocket = require('ws');
const url = require('url');
const URL = url.URL;
const URLSearchParams = url.URLSearchParams;

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

    function authorizeAsync(request, socket, head) {
        const ip = socket.remoteAddress ? socket.remoteAddress : "127.0.0.1";
        const headers = request.headers;
        const url = new URL(request.url, headers.origin ? headers.origin : `http://${headers.host}`);
        const userAgent = headers["user-agent"];

        if(!socket.connectionId) {
            socket.connectionId = uuid.generate();
        }

        return new Promise(function(resolve, reject) {
            var mockContext,
            callback = function(authResponseError, authResponseData) {
                if(authResponseError) {
                    reject(authResponseError);
                } else {
                    socket.principalId = authResponseData.principalId;
                    resolve(authResponseData);
                }
            },
            event = {
                type: 'REQUEST',
                requestContext: {
                        connectionId: socket.connectionId,
                        stage: program.stage,
                        identity: {
                            sourceIp: ip,
                            userAgent: userAgent
                        }
                    },
                    "headers": headers,
                    "body":""
                },
                queryStringParameters,
                multiValueQueryStringParameters;
    
            console.log("request:",request);
            console.log("socket:",socket);

            const searchParams = url.searchParams;

            //Iterate the search parameters.
            for (let p of searchParams) {
                console.log(p);

                (queryStringParameters || (queryStringParameters = {}))[p[0]] = p[1];
                (multiValueQueryStringParameters || (multiValueQueryStringParameters = {}))[p[0]] = [p[1]];
                /*

                    queryStringParameters: {
                    identity: 'ewogICJjcml0ZXJpYSI6IHsKICAgICJwcm90b3R5cGUiOiAibW9udGFnZS9jb3JlL2NyaXRlcmlhIiwKICAgICJ2YWx1ZXMiOiB7CiAgICAgICJleHByZXNzaW9uIjogIm9yaWdpbklkID09ICQub3JpZ2luSWQiLAogICAgICAicGFyYW1ldGVycyI6IHsKICAgICAgICAib3JpZ2luSWQiOiAiMTg3Y2ZhOWEtYzMwMy00NzM3LWE3NzAtMTdkNDZlNzUyNGE0IgogICAgICB9CiAgICB9CiAgfSwKICAiZGF0YXF1ZXJ5IjogewogICAgInByb3RvdHlwZSI6ICJtb250YWdlL2RhdGEvbW9kZWwvZGF0YS1xdWVyeSIsCiAgICAidmFsdWVzIjogewogICAgICAiY3JpdGVyaWEiOiB7IkAiOiAiY3JpdGVyaWEifSwKICAgICAgInR5cGVNb2R1bGUiOiB7CiAgICAgICAgIiUiOiAibW9udGFnZS9kYXRhL21vZGVsL2RhdGEtaWRlbnRpdHkubWpzb24iCiAgICAgIH0KICAgIH0KICB9LAogICJyb290IjogewogICAgInByb3RvdHlwZSI6ICJtb250YWdlL2RhdGEvbW9kZWwvZGF0YS1pZGVudGl0eSIsCiAgICAidmFsdWVzIjogewogICAgICAicXVlcnkiOiB7IkAiOiAiZGF0YXF1ZXJ5In0KICAgIH0KICB9Cn0='
                    },
                    multiValueQueryStringParameters: {
                    identity: [
                        'ewogICJjcml0ZXJpYSI6IHsKICAgICJwcm90b3R5cGUiOiAibW9udGFnZS9jb3JlL2NyaXRlcmlhIiwKICAgICJ2YWx1ZXMiOiB7CiAgICAgICJleHByZXNzaW9uIjogIm9yaWdpbklkID09ICQub3JpZ2luSWQiLAogICAgICAicGFyYW1ldGVycyI6IHsKICAgICAgICAib3JpZ2luSWQiOiAiMTg3Y2ZhOWEtYzMwMy00NzM3LWE3NzAtMTdkNDZlNzUyNGE0IgogICAgICB9CiAgICB9CiAgfSwKICAiZGF0YXF1ZXJ5IjogewogICAgInByb3RvdHlwZSI6ICJtb250YWdlL2RhdGEvbW9kZWwvZGF0YS1xdWVyeSIsCiAgICAidmFsdWVzIjogewogICAgICAiY3JpdGVyaWEiOiB7IkAiOiAiY3JpdGVyaWEifSwKICAgICAgInR5cGVNb2R1bGUiOiB7CiAgICAgICAgIiUiOiAibW9udGFnZS9kYXRhL21vZGVsL2RhdGEtaWRlbnRpdHkubWpzb24iCiAgICAgIH0KICAgIH0KICB9LAogICJyb290IjogewogICAgInByb3RvdHlwZSI6ICJtb250YWdlL2RhdGEvbW9kZWwvZGF0YS1pZGVudGl0eSIsCiAgICAidmFsdWVzIjogewogICAgICAicXVlcnkiOiB7IkAiOiAiZGF0YXF1ZXJ5In0KICAgIH0KICB9Cn0='
                    ]
                    },
                */
            }

            if(queryStringParameters) {
                event.queryStringParameters = queryStringParameters;
                event.multiValueQueryStringParameters = multiValueQueryStringParameters;
            }
  

            //Needs to inject stage property for phront service to use the right info
            functionModule.authorize( event,
                mockContext,
                callback
            );    
        });
        //return new Promise((resolve) => setTimeout(resolve.bind(null, 'Hello world'), 500));
    }
      
    const server = http.createServer();
    const wss = new WebSocket.Server({ noServer: true });

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
        ws.apiGateway = mockGateway;
        worker.apiGateway = ws.apiGateway;
        
        var mockContext = {},
        mockCallback = function(){};

        //Needs to inject stage property for phront service to use the right info
        functionModule.connect( {
                requestContext: {
                    connectionId: req.socket.connectionId,
                    stage: program.stage,
                    identity: {
                        sourceIp: ip,
                        userAgent: userAgent
                    },
                    authorizer: {
                        principalId: req.socket.principalId
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
            
            worker.apiGateway = ws.apiGateway;

            functionModule.default( {
                    requestContext: {
                        connectionId: req.socket.connectionId,
                        stage: program.stage,
                        identity: {
                            sourceIp: ip,
                            userAgent: userAgent
                        },
                        authorizer: {
                            principalId: req.socket.principalId
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

    /*
        inspired by https://github.com/websockets/ws/issues/377
    */

    server.on('upgrade', async (request, socket, head) => {
        let data;
      
        try {
          data = await authorizeAsync(request, socket, head);
        } catch (error) {
          socket.write(`HTTP/1.1 500 ${http.STATUS_CODES[500]}\r\n\r\n`);
          socket.destroy();
          return;
        }
      
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request, data);
        });
      });
      
    server.listen(port);


});

