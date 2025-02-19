//global.Promise = require("bluebird");
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const url = require('url');
const URL = url.URL;
const URLSearchParams = url.URLSearchParams;
const fs = require('fs');


/**
 * The timeoutPromise helper allows you to wrap any promise to fulfill within a timeout.
 * 
 * @param {Promise} promise A promise instance
 * @param {BigInteger} timeoutInMilliseconds The time limit in milliseconds to fulfill or reject the promise.
 * @returns {Promise} A pending Promise
 */
function PromiseTimeout(promise, timeoutInMilliseconds){
    return Promise.race([
        promise, 
        new Promise(function(resolve, reject){
            setTimeout(function() {
                reject(new Error("timeout"));
            }, timeoutInMilliseconds);
        })
    ]);
};


/*
    Input from https://blog.zackad.dev/en/2017/08/19/create-websocket-with-nodejs.html
*/
//See https://www.npmjs.com/package/commander
const { program } = require('commander');

program.option('-f, --function <function>', 'The serveless function to run')
        .option('-p, --port <port>', 'The websocket port to use', 7272)
        .option('-s, --stage <stage>', 'The stage to use', "staging")
        .option('-c, --cert <sslCertificatePath>', 'Path to the ssl certificate file to use', null)
        .option('-k, --key <sslKeyPath>', 'Path to the ssl key file to use', null)
        .option('-gt, --gatewayTimeout <timeout>', 'A timeout for message delivery getting something back', null);

program.parse(process.argv);
var uuid = require("mod/core/uuid");
var functionPath = program.function,
    port = program.port,
    sslCertificatePath = program.cert,
    sslKeyPath = program.key,
    gatewayTimeout = program.gatewayTimeout, /* || 29000, *//* ms - the hard-coded timeout of the AWS APIGateway */
    functionModuleId,
    functionModuledDirName,
    functionModule,
    OperationCoordinatorPromise,
    privateKey,
    certificate,
    credentials;

    // read ssl certificate
    if(sslCertificatePath && sslKeyPath) {
        privateKey = fs.readFileSync(sslKeyPath, 'utf8');
        certificate = fs.readFileSync(sslCertificatePath, 'utf8');
        credentials = { key: privateKey, cert: certificate };        
    }

functionModuledDirName = functionPath.substring(0,functionPath.lastIndexOf("/"));

if(functionPath.endsWith(".js")) {
    functionModuleId = functionPath.substring(0,functionPath.length-3);
    // functionModuleId = functionPath.substring(functionPath.lastIndexOf("/")+1,functionPath.length-3);
}

functionModule = require(functionModuleId);

/*
    As we move to transition from mr's require(async) to node's require (sync) we need to do some tweaking here 
*/
var workerPromise;
if(functionModule && functionModule.worker && typeof functionModule.worker.then !== "function") {
    workerPromise = Promise.resolve(functionModule);
} else {
    workerPromise = functionModule.worker;
}

workerPromise.then(function (worker) {

    function authorizeAsync(request, socket, head) {
        const ip = socket.remoteAddress ? socket.remoteAddress : "127.0.0.1";
        const headers = request.headers;
        const url = new URL(request.url, headers.origin ? headers.origin : `http://${headers.host}`);
        const userAgent = headers["user-agent"];

        if(!socket.connectionId) {
            socket.connectionId = uuid.generate();
        }

        return new Promise(function(resolve, reject) {
            var callbackCalled = false;
            var mockContext = {
                callbackWaitsForEmptyEventLoop: true
            },
            callback = function(authResponseError, authResponseData) {
                var statements;

                callbackCalled = true;
                if(authResponseError) {
                    reject(authResponseError);
                } else if((statements = authResponseData?.policyDocument?.Statement)) {

                    var hasDeny = false,
                        hasAllow = false,
                        countI = statements.length,
                        i = 0;
                
                    for(; ( i < countI); i++ ) {
                        if(statements[i].Effect !== "Allow") {
                            console.log("main authorize authResponse Deny:",authResponse);
                            if(timer) console.log(timer.runtimeMsStr());
                            hasDeny = true;
                            break;
                        } else {
                            hasAllow = true;
                        }
                    }

                    if(hasDeny) {
                        reject(new Error("Unauthorized"));
                    }
                    else if(hasAllow) {
                        socket.principalId = authResponseData.principalId;
                        resolve(authResponseData);
                    }

                } else {
                    reject(new Error(JSON.stringify(authResponseData)));
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
    
            // console.log("request:",request);
            // console.log("socket:",socket);

            const searchParams = url.searchParams;

            //Iterate the search parameters.
            for (let p of searchParams) {
                //console.log("searchParams: ", p);

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
            var authorizePromise = functionModule.authorize( event,
                mockContext,
                callback
            );

            if(authorizePromise) {
                authorizePromise.then((resolvedValue) => {
                    if(!callbackCalled) {
                        callback(null, resolvedValue);
                    }
                    
                }, (error) => {
                    if(!callbackCalled) {
                        callback(error);
                    }
                })

            }
        });
        //return new Promise((resolve) => setTimeout(resolve.bind(null, 'Hello world'), 500));
    }

    const server = credentials ?  https.createServer(credentials) : http.createServer();

    const wss = new WebSocket.Server({ noServer: true });
    console.log("Starting a websocket server!");

    const websocketTable = {};

    const mockGateway =  {
        postToConnection: function(params) {
            /* params looks like:
                {
                    ConnectionId: event.requestContext.connectionId,
                    Data: self._serializer.serializeObject(readOperationCompleted)
                }
            */
          
            this._promise = new Promise(function(resolve,reject) { 
            //Retrieve the appropriate websocket on which to respond from our websocket map
            var connectionId = params.ConnectionId;
            var response_websocket = websocketTable[connectionId];
            var serializedHandledOperation = params.Data;
            //Need to check if the websocket has already been cleaned up and removed from the table by now.
            //This can happen if it's closed while we're processing a request.
            if (response_websocket) {
              console.log("Sending response on Websocket Connection with Remote IP:", response_websocket._socket.remoteAddress, " Remote Port: ", response_websocket._socket.remotePort, "ConnectionId:", response_websocket._socket.connectionId);
              response_websocket.send(serializedHandledOperation);
            }
            else {
              console.log("Would have sent a response to a websocket connection, but the socket was closed before we were ready to send this data.")
            }
            resolve(true);
            });
            return this;
        },
        promise: function() {
            return this._promise;
        }
    };
    
    worker.apiGateway =  mockGateway;
    
    wss.on('connection', function connection(ws, req) {

        console.log("ws: New Websocket Connection with Remote IP:", req.socket.remoteAddress ," Remote Port: ", req.socket.remotePort ,  "ConnectionId:",req.socket.connectionId);
        const ip = req ? req.socket.remoteAddress: "127.0.0.1";
        const headers = req.headers;
        const userAgent = headers["user-agent"];
        websocketTable[req.socket.connectionId] = ws;

        ws.on('close', function close(code,reason) {
            console.log("Closing ws with code:",code," and Reason:",reason);
            delete websocketTable[req.socket.connectionId];
        });

        ws.on('error', function ws_error(error) {
            console.log("Error in ws",error);
            delete websocketTable[req.socket.connectionId];
         });

        /*
            When the server runs behind a proxy like NGINX, the de-facto standard is to use the X-Forwarded-For header.
        */
       //const ip = req.headers['x-forwarded-for'].split(/\s*,\s*/)[0];

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
                mockDefaultCallback = function(error, result){},
                callbackCalled = false;

            var defaultPromise = functionModule.default( {
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
          
            if(defaultPromise) {
                defaultPromise.then((resolvedValue) => {
                    if(!callbackCalled) {
                        mockDefaultCallback(null, resolvedValue);
                    }
                    
                }, (error) => {
                    if(!callbackCalled) {
                        mockDefaultCallback(error);
                    }
                })
            }
        });
    });

    /*
        inspired by https://github.com/websockets/ws/issues/377
    */

    server.on('upgrade', async (request, socket, head) => {
        let data;
      
        try {
            if(gatewayTimeout) {
                data = await PromiseTimeout(authorizeAsync(request, socket, head), gatewayTimeout);
            } else {
                data = await authorizeAsync(request, socket, head);
            }
        } catch (error) {
            console.log("on upgrade error: ", error);
            socket.write(`HTTP/1.1 500 ${http.STATUS_CODES[500]}\r\n\r\n`);
            socket.destroy();
            return;
        }
      
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request, data);
        });
      });
      

    server.on("request", (request, response) => {
        // handle requests

        let data = []
        request
          .on("data", d => {
            data.push(d)
          })
          .on("end", () => {
            data = Buffer.concat(data).toString();


            var mockDefaultContext = {},
            mockDefaultCallback = function(){};
            

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



            response.statusCode = 201;
            response.end();
          })
      
    });
      
    server.listen(port);

});
