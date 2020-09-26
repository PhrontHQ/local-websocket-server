const WebSocket = require('ws');
var Montage = require('montage/montage'),
    PATH = require("path"),
    uuid = require("montage/core/uuid"),
    OperationCoordinatorPromise;

// //From Montage
// Load package
OperationCoordinatorPromise = Montage.loadPackage(PATH.join(__dirname, "."), {
    mainPackageLocation: PATH.join(__filename, ".")
})
.then(function (mr) {
    return mr.async('phront/data/main.datareel/service/operation-coordinator');
})
.then(function (module) {
    global.OperationCoordinator = module.OperationCoordinator;
    // console.log("OperationCoordinator ready");
    return new module.OperationCoordinator;
});

const wss = new WebSocket.Server({ port: 7272 });

wss.on('connection', function connection(ws) {
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

    ws.on('message', function incoming(message) {

        OperationCoordinatorPromise.then(function(operationCoordinator) {
            //console.log("message",message);
            var serializedOperation = message;

            var mockContext,
            mockCallback;
    
            operationCoordinator.handleMessage(
                {
                    requestContext: {
                        connectionId: uuid.generate()
                    },
                    "body":serializedOperation
                },
                mockContext,mockCallback,mockGateway);
        })

      
            //console.log('received: %s', message);
    });
 
    //ws.send('something');
});