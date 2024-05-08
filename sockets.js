"use strict";

var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketAdapter = exports.SocketIOAdapter = exports.isSocketIoPath = exports.init = void 0;
var events_1 = require("events");
var socketio = require("socket.io");
var url = require("url");
// tslint:disable-next-line:enforce-name-casing
var webSocket = require("ws");
var logging = require("./logging");
var sessionCounter = 0;
/**
 * The application settings instance.
 */
var appSettings;
/**
 * Creates a WebSocket connected to the Jupyter server for the URL in the
 * specified session.
 */
function createWebSocket(socketHost, port, session) {
    var path = url.parse(session.url).path;
    var socketUrl = "ws://".concat(socketHost, ":").concat(port).concat(path);
    logging.getLogger().debug('Creating WebSocket to %s for session %d', socketUrl, session.id);
    var ws = new webSocket(socketUrl);
    ws.on('open', function () {
        // Stash the resulting WebSocket, now that it is in open state
        session.webSocket = ws;
        session.socket.emit('open', { url: session.url });
    })
        .on('close', function () {
        // Remove the WebSocket from the session, once it is in closed state
        logging.getLogger().debug('WebSocket [%d] closed', session.id);
        session.webSocket = null;
        session.socket.emit('close', { url: session.url });
    })
        .on('message', function (data) {
        // Propagate messages arriving on the WebSocket to the client.
        if (data instanceof Buffer) {
            logging.getLogger().debug('WebSocket [%d] binary message length %d', session.id, data.length);
        }
        else {
            logging.getLogger().debug('WebSocket [%d] message\n%j', session.id, data);
        }
        session.socket.emit('data', { data: data });
    })
        // tslint:disable-next-line:no-any
        .on('error', function (e) {
        logging.getLogger().error('WebSocket [%d] error\n%j', session.id, e);
        if (e.code === 'ECONNREFUSED') {
            // This happens in the following situation -- old kernel that has gone
            // away likely due to a restart/shutdown... and an old notebook client
            // attempts to reconnect to the old kernel. That connection will be
            // refused. In this case, there is no point in keeping this socket.io
            // connection open.
            session.socket.disconnect(/* close */ true);
        }
    });
    return ws;
}
/**
 * Closes the WebSocket instance associated with the session.
 */
function closeWebSocket(session) {
    if (session.webSocket) {
        session.webSocket.close();
        session.webSocket = null;
    }
}
/**
 * Handles communication over the specified socket.
 */
function socketHandler(socket) {
    sessionCounter++;
    // Each socket is associated with a session that tracks the following:
    // - id: a counter for use in log output
    // - url: the url used to connect to the Jupyter server
    // - socket: the socket.io socket reference, which generates message
    //           events for anything sent by the browser client, and allows
    //           emitting messages to send to the browser
    // - webSocket: the corresponding WebSocket connection to the Jupyter
    //              server.
    // Within a session, messages recieved over the socket.io socket (from the
    // browser) are relayed to the WebSocket, and messages recieved over the
    // WebSocket socket are relayed back to the socket.io socket (to the browser).
    var session = { id: sessionCounter, url: '', socket: socket, webSocket: null };
    logging.getLogger().debug('Socket connected for session %d', session.id);
    socket.on('disconnect', function (reason) {
        logging.getLogger().debug('Socket disconnected for session %d reason: %s', session.id, reason);
        // Handle client disconnects to close WebSockets, so as to free up resources
        closeWebSocket(session);
    });
    socket.on('start', function (message) {
        logging.getLogger().debug('Start in session %d with url %s', session.id, message.url);
        try {
            var port = appSettings.nextJupyterPort;
            if (appSettings.kernelManagerProxyPort) {
                port = appSettings.kernelManagerProxyPort;
                logging.getLogger().debug('Using kernel manager proxy port %d', port);
            }
            var host = 'localhost';
            if (appSettings.kernelManagerProxyHost) {
                host = appSettings.kernelManagerProxyHost;
            }
            session.url = message.url;
            session.webSocket = createWebSocket(host, port, session);
            // tslint:disable-next-line:no-any
        }
        catch (e) {
            logging.getLogger().error(e, 'Unable to create WebSocket connection to %s', message.url);
            session.socket.disconnect(/* close */ true);
        }
    });
    socket.on('stop', function (message) {
        logging.getLogger().debug('Stop in session %d with url %s', session.id, message.url);
        closeWebSocket(session);
    });
    socket.on('data', function (message) {
        // Propagate the message over to the WebSocket.
        if (session.webSocket) {
            if (message instanceof Buffer) {
                logging.getLogger().debug('Send binary data of length %d in session %d.', message.length, session.id);
                session.webSocket.send(message, function (e) {
                    if (e) {
                        logging.getLogger().error(e, 'Failed to send message to websocket');
                    }
                });
            }
            else {
                logging.getLogger().debug('Send data in session %d\n%s', session.id, message.data);
                session.webSocket.send(message.data, function (e) {
                    if (e) {
                        logging.getLogger().error(e, 'Failed to send message to websocket');
                    }
                });
            }
        }
        else {
            logging.getLogger().error('Unable to send message; WebSocket is not open');
        }
    });
}
/** Initialize the socketio handler. */
function init(server, settings) {
    appSettings = settings;
    var io = socketio(server, {
        path: '/socket.io',
        transports: ['polling'],
        allowUpgrades: false,
        // v2.10 changed default from 60s to 5s, prefer the longer timeout to
        // avoid errant disconnects.
        pingTimeout: 60000,
    });
    io.of('/session').on('connection', socketHandler);
    return io;
}
exports.init = init;
/** Return true iff path is handled by socket.io. */
function isSocketIoPath(path) {
    return path.indexOf('/socket.io/') === 0;
}
exports.isSocketIoPath = isSocketIoPath;
/** A base class for socket classes adapting to the Socket interface. */
var Adapter = /** @class */ (function () {
    function Adapter() {
        this.emitter = new events_1.EventEmitter();
    }
    Adapter.prototype.onClose = function (listener) {
        this.emitter.on('close', listener);
    };
    Adapter.prototype.onStringMessage = function (listener) {
        this.emitter.on('string_message', listener);
    };
    Adapter.prototype.onBinaryMessage = function (listener) {
        this.emitter.on('binary_message', listener);
    };
    return Adapter;
}());
/** A socket adapter for socket.io.  */
var SocketIOAdapter = /** @class */ (function (_super) {
    __extends(SocketIOAdapter, _super);
    function SocketIOAdapter(socket) {
        var _this = _super.call(this) || this;
        _this.socket = socket;
        _this.socket.on('error', function (err) {
            logging.getLogger().error("error on socket.io: ".concat(err));
            // Event unsupported in Socket.
        });
        _this.socket.on('disconnecting', function () {
            logging.getLogger().error("disconnecting socket.io");
            // Event unsupported in Socket.
        });
        _this.socket.on('disconnect', function (reason) {
            _this.emitter.emit('close', reason);
        });
        _this.socket.on('data', function (event) {
            if (event instanceof Buffer) {
                _this.emitter.emit('binary_message', event);
            }
            else if (typeof event.data === 'string') {
                _this.emitter.emit('string_message', event.data);
            }
            else {
                _this.emitter.emit('binary_message', event.data);
            }
        });
        return _this;
    }
    SocketIOAdapter.prototype.sendString = function (data) {
        this.socket.emit('data', { data: data });
    };
    SocketIOAdapter.prototype.sendBinary = function (data) {
        this.socket.emit('data', { data: data });
    };
    SocketIOAdapter.prototype.close = function (keepTransportOpen) {
        this.socket.disconnect(!keepTransportOpen);
    };
    return SocketIOAdapter;
}(Adapter));
exports.SocketIOAdapter = SocketIOAdapter;
/** A socket adapter for websockets.  */
var WebSocketAdapter = /** @class */ (function (_super) {
    __extends(WebSocketAdapter, _super);
    function WebSocketAdapter(ws) {
        var _this = _super.call(this) || this;
        _this.ws = ws;
        _this.ws.on('error', function (err) {
            logging.getLogger().error("websocket error: ".concat(err));
        });
        _this.ws.on('disconnecting', function () {
            logging.getLogger().error("disconnecting websocket");
            // Event unsupported in Socket.
        });
        _this.ws.on('close', function (code, reason) {
            _this.emitter.emit('close', "code:".concat(code, " reason:").concat(reason));
        });
        _this.ws.on('message', function (data) {
            if (typeof data === 'string') {
                _this.emitter.emit('string_message', data);
            }
            else {
                _this.emitter.emit('binary_message', data);
            }
        });
        return _this;
    }
    WebSocketAdapter.prototype.sendString = function (data) {
        if (this.ws.readyState === webSocket.OPEN) {
            this.ws.send(data);
        }
    };
    WebSocketAdapter.prototype.sendBinary = function (data) {
        if (this.ws.readyState === webSocket.OPEN) {
            this.ws.send(data);
        }
    };
    // tslint:disable-next-line:no-unused-variable
    WebSocketAdapter.prototype.close = function (keepTransportOpen) {
        this.ws.close();
    };
    return WebSocketAdapter;
}(Adapter));
exports.WebSocketAdapter = WebSocketAdapter;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic29ja2V0cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uL3RoaXJkX3BhcnR5L2NvbGFiL3NvdXJjZXMvc29ja2V0cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7O0dBY0c7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUVILGlDQUFvQztBQUVwQyxvQ0FBc0M7QUFDdEMseUJBQTJCO0FBQzNCLCtDQUErQztBQUMvQyw4QkFBZ0M7QUFHaEMsbUNBQXFDO0FBaUJyQyxJQUFJLGNBQWMsR0FBRyxDQUFDLENBQUM7QUFFdkI7O0dBRUc7QUFDSCxJQUFJLFdBQXdCLENBQUM7QUFFN0I7OztHQUdHO0FBQ0gsU0FBUyxlQUFlLENBQ3BCLFVBQWtCLEVBQUUsSUFBWSxFQUFFLE9BQWdCO0lBQ3BELElBQU0sSUFBSSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztJQUN6QyxJQUFNLFNBQVMsR0FBRyxlQUFRLFVBQVUsY0FBSSxJQUFJLFNBQUcsSUFBSSxDQUFFLENBQUM7SUFDdEQsT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFDLEtBQUssQ0FDckIseUNBQXlDLEVBQUUsU0FBUyxFQUFFLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUV0RSxJQUFNLEVBQUUsR0FBRyxJQUFJLFNBQVMsQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUNwQyxFQUFFLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFDTjtRQUNFLDhEQUE4RDtRQUM5RCxPQUFPLENBQUMsU0FBUyxHQUFHLEVBQUUsQ0FBQztRQUN2QixPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsRUFBQyxHQUFHLEVBQUUsT0FBTyxDQUFDLEdBQUcsRUFBQyxDQUFDLENBQUM7SUFDbEQsQ0FBQyxDQUFDO1NBQ0gsRUFBRSxDQUFDLE9BQU8sRUFDUDtRQUNFLG9FQUFvRTtRQUNwRSxPQUFPLENBQUMsU0FBUyxFQUFFLENBQUMsS0FBSyxDQUFDLHVCQUF1QixFQUFFLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUMvRCxPQUFPLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQztRQUN6QixPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsRUFBQyxHQUFHLEVBQUUsT0FBTyxDQUFDLEdBQUcsRUFBQyxDQUFDLENBQUM7SUFDbkQsQ0FBQyxDQUFDO1NBQ0wsRUFBRSxDQUFDLFNBQVMsRUFDVCxVQUFDLElBQUk7UUFDSCw4REFBOEQ7UUFDOUQsSUFBSSxJQUFJLFlBQVksTUFBTSxFQUFFLENBQUM7WUFDM0IsT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFDLEtBQUssQ0FDckIseUNBQXlDLEVBQUUsT0FBTyxDQUFDLEVBQUUsRUFDckQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ25CLENBQUM7YUFBTSxDQUFDO1lBQ04sT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFDLEtBQUssQ0FDckIsNEJBQTRCLEVBQUUsT0FBTyxDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN0RCxDQUFDO1FBQ0QsT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLEVBQUMsSUFBSSxNQUFBLEVBQUMsQ0FBQyxDQUFDO0lBQ3RDLENBQUMsQ0FBQztRQUNOLGtDQUFrQztTQUNqQyxFQUFFLENBQUMsT0FBTyxFQUFFLFVBQUMsQ0FBTTtRQUNsQixPQUFPLENBQUMsU0FBUyxFQUFFLENBQUMsS0FBSyxDQUFDLDBCQUEwQixFQUFFLE9BQU8sQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDckUsSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLGNBQWMsRUFBRSxDQUFDO1lBQzlCLHNFQUFzRTtZQUN0RSxzRUFBc0U7WUFDdEUsbUVBQW1FO1lBQ25FLHFFQUFxRTtZQUNyRSxtQkFBbUI7WUFDbkIsT0FBTyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzlDLENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztJQUVQLE9BQU8sRUFBRSxDQUFDO0FBQ1osQ0FBQztBQUVEOztHQUVHO0FBQ0gsU0FBUyxjQUFjLENBQUMsT0FBZ0I7SUFDdEMsSUFBSSxPQUFPLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDdEIsT0FBTyxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUMxQixPQUFPLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQztJQUMzQixDQUFDO0FBQ0gsQ0FBQztBQUVEOztHQUVHO0FBQ0gsU0FBUyxhQUFhLENBQUMsTUFBdUI7SUFDNUMsY0FBYyxFQUFFLENBQUM7SUFFakIsc0VBQXNFO0lBQ3RFLHdDQUF3QztJQUN4Qyx1REFBdUQ7SUFDdkQsb0VBQW9FO0lBQ3BFLHVFQUF1RTtJQUN2RSxxREFBcUQ7SUFDckQscUVBQXFFO0lBQ3JFLHVCQUF1QjtJQUN2QiwwRUFBMEU7SUFDMUUsd0VBQXdFO0lBQ3hFLDhFQUE4RTtJQUM5RSxJQUFNLE9BQU8sR0FDQyxFQUFDLEVBQUUsRUFBRSxjQUFjLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxNQUFNLFFBQUEsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFDLENBQUM7SUFFckUsT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFDLEtBQUssQ0FBQyxpQ0FBaUMsRUFBRSxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7SUFFekUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxZQUFZLEVBQUUsVUFBQyxNQUFNO1FBQzdCLE9BQU8sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxLQUFLLENBQ3JCLCtDQUErQyxFQUFFLE9BQU8sQ0FBQyxFQUFFLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFFekUsNEVBQTRFO1FBQzVFLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUMxQixDQUFDLENBQUMsQ0FBQztJQUVILE1BQU0sQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLFVBQUMsT0FBdUI7UUFDekMsT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFDLEtBQUssQ0FDckIsaUNBQWlDLEVBQUUsT0FBTyxDQUFDLEVBQUUsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFaEUsSUFBSSxDQUFDO1lBQ0gsSUFBSSxJQUFJLEdBQUcsV0FBVyxDQUFDLGVBQWUsQ0FBQztZQUN2QyxJQUFJLFdBQVcsQ0FBQyxzQkFBc0IsRUFBRSxDQUFDO2dCQUN2QyxJQUFJLEdBQUcsV0FBVyxDQUFDLHNCQUFzQixDQUFDO2dCQUMxQyxPQUFPLENBQUMsU0FBUyxFQUFFLENBQUMsS0FBSyxDQUFDLG9DQUFvQyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ3hFLENBQUM7WUFDRCxJQUFJLElBQUksR0FBRyxXQUFXLENBQUM7WUFDdkIsSUFBSSxXQUFXLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztnQkFDdkMsSUFBSSxHQUFHLFdBQVcsQ0FBQyxzQkFBc0IsQ0FBQztZQUM1QyxDQUFDO1lBQ0QsT0FBTyxDQUFDLEdBQUcsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDO1lBQzFCLE9BQU8sQ0FBQyxTQUFTLEdBQUcsZUFBZSxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDekQsa0NBQWtDO1FBQ3BDLENBQUM7UUFBQyxPQUFPLENBQU0sRUFBRSxDQUFDO1lBQ2hCLE9BQU8sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxLQUFLLENBQ3JCLENBQUMsRUFBRSw2Q0FBNkMsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDbkUsT0FBTyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzlDLENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztJQUVILE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLFVBQUMsT0FBdUI7UUFDeEMsT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFDLEtBQUssQ0FDckIsZ0NBQWdDLEVBQUUsT0FBTyxDQUFDLEVBQUUsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFL0QsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzFCLENBQUMsQ0FBQyxDQUFDO0lBRUgsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsVUFBQyxPQUFvQjtRQUNyQywrQ0FBK0M7UUFDL0MsSUFBSSxPQUFPLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDdEIsSUFBSSxPQUFPLFlBQVksTUFBTSxFQUFFLENBQUM7Z0JBQzlCLE9BQU8sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxLQUFLLENBQ3JCLDhDQUE4QyxFQUFFLE9BQU8sQ0FBQyxNQUFNLEVBQzlELE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDaEIsT0FBTyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLFVBQUMsQ0FBQztvQkFDaEMsSUFBSSxDQUFDLEVBQUUsQ0FBQzt3QkFDTixPQUFPLENBQUMsU0FBUyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxxQ0FBcUMsQ0FBQyxDQUFDO29CQUN0RSxDQUFDO2dCQUNILENBQUMsQ0FBQyxDQUFDO1lBQ0wsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLE9BQU8sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxLQUFLLENBQ3JCLDZCQUE2QixFQUFFLE9BQU8sQ0FBQyxFQUFFLEVBQUUsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUM3RCxPQUFPLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLFVBQUMsQ0FBQztvQkFDckMsSUFBSSxDQUFDLEVBQUUsQ0FBQzt3QkFDTixPQUFPLENBQUMsU0FBUyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxxQ0FBcUMsQ0FBQyxDQUFDO29CQUN0RSxDQUFDO2dCQUNILENBQUMsQ0FBQyxDQUFDO1lBQ0wsQ0FBQztRQUNILENBQUM7YUFBTSxDQUFDO1lBQ04sT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFDLEtBQUssQ0FDckIsK0NBQStDLENBQUMsQ0FBQztRQUN2RCxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDO0FBRUQsdUNBQXVDO0FBQ3ZDLFNBQWdCLElBQUksQ0FDaEIsTUFBbUIsRUFBRSxRQUFxQjtJQUM1QyxXQUFXLEdBQUcsUUFBUSxDQUFDO0lBQ3ZCLElBQU0sRUFBRSxHQUFHLFFBQVEsQ0FBQyxNQUFNLEVBQUU7UUFDMUIsSUFBSSxFQUFFLFlBQVk7UUFDbEIsVUFBVSxFQUFFLENBQUMsU0FBUyxDQUFDO1FBQ3ZCLGFBQWEsRUFBRSxLQUFLO1FBQ3BCLHFFQUFxRTtRQUNyRSw0QkFBNEI7UUFDNUIsV0FBVyxFQUFFLEtBQUs7S0FDbkIsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxFQUFFLENBQUMsWUFBWSxFQUFFLGFBQWEsQ0FBQyxDQUFDO0lBQ2xELE9BQU8sRUFBRSxDQUFDO0FBQ1osQ0FBQztBQWRELG9CQWNDO0FBRUQsb0RBQW9EO0FBQ3BELFNBQWdCLGNBQWMsQ0FBQyxJQUFZO0lBQ3pDLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDM0MsQ0FBQztBQUZELHdDQUVDO0FBa0NELHdFQUF3RTtBQUN4RTtJQUFBO1FBQ3FCLFlBQU8sR0FBRyxJQUFJLHFCQUFZLEVBQUUsQ0FBQztJQW1CbEQsQ0FBQztJQVhDLHlCQUFPLEdBQVAsVUFBUSxRQUFrQztRQUN4QyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDckMsQ0FBQztJQUVELGlDQUFlLEdBQWYsVUFBZ0IsUUFBZ0M7UUFDOUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsZ0JBQWdCLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDOUMsQ0FBQztJQUVELGlDQUFlLEdBQWYsVUFBZ0IsUUFBZ0M7UUFDOUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsZ0JBQWdCLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDOUMsQ0FBQztJQUNILGNBQUM7QUFBRCxDQUFDLEFBcEJELElBb0JDO0FBR0QsdUNBQXVDO0FBQ3ZDO0lBQXFDLG1DQUFPO0lBQzFDLHlCQUE2QixNQUF1QjtRQUNsRCxZQUFBLE1BQUssV0FBRSxTQUFDO1FBRG1CLFlBQU0sR0FBTixNQUFNLENBQWlCO1FBRWxELEtBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxVQUFDLEdBQUc7WUFDMUIsT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFDLEtBQUssQ0FBQyw4QkFBdUIsR0FBRyxDQUFFLENBQUMsQ0FBQztZQUN4RCwrQkFBK0I7UUFDakMsQ0FBQyxDQUFDLENBQUM7UUFFSCxLQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxlQUFlLEVBQUU7WUFDOUIsT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFDLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO1lBQ3JELCtCQUErQjtRQUNqQyxDQUFDLENBQUMsQ0FBQztRQUVILEtBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLFlBQVksRUFBRSxVQUFDLE1BQU07WUFDbEMsS0FBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ3JDLENBQUMsQ0FBQyxDQUFDO1FBRUgsS0FBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLFVBQUMsS0FBeUI7WUFDL0MsSUFBSSxLQUFLLFlBQVksTUFBTSxFQUFFLENBQUM7Z0JBQzVCLEtBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzdDLENBQUM7aUJBQU0sSUFBSSxPQUFPLEtBQUssQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7Z0JBQzFDLEtBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNsRCxDQUFDO2lCQUFNLENBQUM7Z0JBQ04sS0FBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2xELENBQUM7UUFDSCxDQUFDLENBQUMsQ0FBQzs7SUFDTCxDQUFDO0lBRUQsb0NBQVUsR0FBVixVQUFXLElBQVk7UUFDckIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLEVBQUMsSUFBSSxNQUFBLEVBQUMsQ0FBQyxDQUFDO0lBQ25DLENBQUM7SUFFRCxvQ0FBVSxHQUFWLFVBQVcsSUFBaUI7UUFDMUIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLEVBQUMsSUFBSSxNQUFBLEVBQUMsQ0FBQyxDQUFDO0lBQ25DLENBQUM7SUFFRCwrQkFBSyxHQUFMLFVBQU0saUJBQTBCO1FBQzlCLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsaUJBQWlCLENBQUMsQ0FBQztJQUM3QyxDQUFDO0lBQ0gsc0JBQUM7QUFBRCxDQUFDLEFBdkNELENBQXFDLE9BQU8sR0F1QzNDO0FBdkNZLDBDQUFlO0FBeUM1Qix3Q0FBd0M7QUFDeEM7SUFBc0Msb0NBQU87SUFDM0MsMEJBQTZCLEVBQWE7UUFDeEMsWUFBQSxNQUFLLFdBQUUsU0FBQztRQURtQixRQUFFLEdBQUYsRUFBRSxDQUFXO1FBRXhDLEtBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxVQUFDLEdBQUc7WUFDdEIsT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFDLEtBQUssQ0FBQywyQkFBb0IsR0FBRyxDQUFFLENBQUMsQ0FBQztRQUN2RCxDQUFDLENBQUMsQ0FBQztRQUVILEtBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLGVBQWUsRUFBRTtZQUMxQixPQUFPLENBQUMsU0FBUyxFQUFFLENBQUMsS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUM7WUFDckQsK0JBQStCO1FBQ2pDLENBQUMsQ0FBQyxDQUFDO1FBRUgsS0FBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLFVBQUMsSUFBSSxFQUFFLE1BQU07WUFDL0IsS0FBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLGVBQVEsSUFBSSxxQkFBVyxNQUFNLENBQUUsQ0FBQyxDQUFDO1FBQzlELENBQUMsQ0FBQyxDQUFDO1FBRUgsS0FBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsU0FBUyxFQUFFLFVBQUMsSUFBSTtZQUN6QixJQUFJLE9BQU8sSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFDO2dCQUM3QixLQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUM1QyxDQUFDO2lCQUFNLENBQUM7Z0JBQ04sS0FBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDNUMsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDOztJQUNMLENBQUM7SUFFRCxxQ0FBVSxHQUFWLFVBQVcsSUFBWTtRQUNyQixJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsVUFBVSxLQUFLLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUMxQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNyQixDQUFDO0lBQ0gsQ0FBQztJQUVELHFDQUFVLEdBQVYsVUFBVyxJQUFpQjtRQUMxQixJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsVUFBVSxLQUFLLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUMxQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNyQixDQUFDO0lBQ0gsQ0FBQztJQUVELDhDQUE4QztJQUM5QyxnQ0FBSyxHQUFMLFVBQU0saUJBQTBCO1FBQzlCLElBQUksQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDbEIsQ0FBQztJQUNILHVCQUFDO0FBQUQsQ0FBQyxBQXpDRCxDQUFzQyxPQUFPLEdBeUM1QztBQXpDWSw0Q0FBZ0IiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IDIwMTUgR29vZ2xlIEluYy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpOyB5b3UgbWF5IG5vdFxuICogdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLiBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2ZcbiAqIHRoZSBMaWNlbnNlIGF0XG4gKlxuICogaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4gKlxuICogVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuICogZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLCBXSVRIT1VUXG4gKiBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuIFNlZSB0aGVcbiAqIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kIGxpbWl0YXRpb25zIHVuZGVyXG4gKiB0aGUgTGljZW5zZS5cbiAqL1xuXG5pbXBvcnQge0V2ZW50RW1pdHRlcn0gZnJvbSAnZXZlbnRzJztcbmltcG9ydCAqIGFzIGh0dHAgZnJvbSAnaHR0cCc7XG5pbXBvcnQgKiBhcyBzb2NrZXRpbyBmcm9tICdzb2NrZXQuaW8nO1xuaW1wb3J0ICogYXMgdXJsIGZyb20gJ3VybCc7XG4vLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6ZW5mb3JjZS1uYW1lLWNhc2luZ1xuaW1wb3J0ICogYXMgd2ViU29ja2V0IGZyb20gJ3dzJztcblxuaW1wb3J0IHtBcHBTZXR0aW5nc30gZnJvbSAnLi9hcHBTZXR0aW5ncyc7XG5pbXBvcnQgKiBhcyBsb2dnaW5nIGZyb20gJy4vbG9nZ2luZyc7XG5cbmludGVyZmFjZSBTZXNzaW9uIHtcbiAgaWQ6IG51bWJlcjtcbiAgdXJsOiBzdHJpbmc7XG4gIHNvY2tldDogU29ja2V0SU8uU29ja2V0O1xuICB3ZWJTb2NrZXQ6IHdlYlNvY2tldHxudWxsO1xufVxuXG5pbnRlcmZhY2UgU2Vzc2lvbk1lc3NhZ2Uge1xuICB1cmw6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIERhdGFNZXNzYWdlIHtcbiAgZGF0YTogc3RyaW5nO1xufVxuXG5sZXQgc2Vzc2lvbkNvdW50ZXIgPSAwO1xuXG4vKipcbiAqIFRoZSBhcHBsaWNhdGlvbiBzZXR0aW5ncyBpbnN0YW5jZS5cbiAqL1xubGV0IGFwcFNldHRpbmdzOiBBcHBTZXR0aW5ncztcblxuLyoqXG4gKiBDcmVhdGVzIGEgV2ViU29ja2V0IGNvbm5lY3RlZCB0byB0aGUgSnVweXRlciBzZXJ2ZXIgZm9yIHRoZSBVUkwgaW4gdGhlXG4gKiBzcGVjaWZpZWQgc2Vzc2lvbi5cbiAqL1xuZnVuY3Rpb24gY3JlYXRlV2ViU29ja2V0KFxuICAgIHNvY2tldEhvc3Q6IHN0cmluZywgcG9ydDogbnVtYmVyLCBzZXNzaW9uOiBTZXNzaW9uKTogd2ViU29ja2V0IHtcbiAgY29uc3QgcGF0aCA9IHVybC5wYXJzZShzZXNzaW9uLnVybCkucGF0aDtcbiAgY29uc3Qgc29ja2V0VXJsID0gYHdzOi8vJHtzb2NrZXRIb3N0fToke3BvcnR9JHtwYXRofWA7XG4gIGxvZ2dpbmcuZ2V0TG9nZ2VyKCkuZGVidWcoXG4gICAgICAnQ3JlYXRpbmcgV2ViU29ja2V0IHRvICVzIGZvciBzZXNzaW9uICVkJywgc29ja2V0VXJsLCBzZXNzaW9uLmlkKTtcblxuICBjb25zdCB3cyA9IG5ldyB3ZWJTb2NrZXQoc29ja2V0VXJsKTtcbiAgd3Mub24oJ29wZW4nLFxuICAgICAgICAoKSA9PiB7XG4gICAgICAgICAgLy8gU3Rhc2ggdGhlIHJlc3VsdGluZyBXZWJTb2NrZXQsIG5vdyB0aGF0IGl0IGlzIGluIG9wZW4gc3RhdGVcbiAgICAgICAgICBzZXNzaW9uLndlYlNvY2tldCA9IHdzO1xuICAgICAgICAgIHNlc3Npb24uc29ja2V0LmVtaXQoJ29wZW4nLCB7dXJsOiBzZXNzaW9uLnVybH0pO1xuICAgICAgICB9KVxuICAgICAgLm9uKCdjbG9zZScsXG4gICAgICAgICAgKCkgPT4ge1xuICAgICAgICAgICAgLy8gUmVtb3ZlIHRoZSBXZWJTb2NrZXQgZnJvbSB0aGUgc2Vzc2lvbiwgb25jZSBpdCBpcyBpbiBjbG9zZWQgc3RhdGVcbiAgICAgICAgICAgIGxvZ2dpbmcuZ2V0TG9nZ2VyKCkuZGVidWcoJ1dlYlNvY2tldCBbJWRdIGNsb3NlZCcsIHNlc3Npb24uaWQpO1xuICAgICAgICAgICAgc2Vzc2lvbi53ZWJTb2NrZXQgPSBudWxsO1xuICAgICAgICAgICAgc2Vzc2lvbi5zb2NrZXQuZW1pdCgnY2xvc2UnLCB7dXJsOiBzZXNzaW9uLnVybH0pO1xuICAgICAgICAgIH0pXG4gICAgICAub24oJ21lc3NhZ2UnLFxuICAgICAgICAgIChkYXRhKSA9PiB7XG4gICAgICAgICAgICAvLyBQcm9wYWdhdGUgbWVzc2FnZXMgYXJyaXZpbmcgb24gdGhlIFdlYlNvY2tldCB0byB0aGUgY2xpZW50LlxuICAgICAgICAgICAgaWYgKGRhdGEgaW5zdGFuY2VvZiBCdWZmZXIpIHtcbiAgICAgICAgICAgICAgbG9nZ2luZy5nZXRMb2dnZXIoKS5kZWJ1ZyhcbiAgICAgICAgICAgICAgICAgICdXZWJTb2NrZXQgWyVkXSBiaW5hcnkgbWVzc2FnZSBsZW5ndGggJWQnLCBzZXNzaW9uLmlkLFxuICAgICAgICAgICAgICAgICAgZGF0YS5sZW5ndGgpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgbG9nZ2luZy5nZXRMb2dnZXIoKS5kZWJ1ZyhcbiAgICAgICAgICAgICAgICAgICdXZWJTb2NrZXQgWyVkXSBtZXNzYWdlXFxuJWonLCBzZXNzaW9uLmlkLCBkYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNlc3Npb24uc29ja2V0LmVtaXQoJ2RhdGEnLCB7ZGF0YX0pO1xuICAgICAgICAgIH0pXG4gICAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6bm8tYW55XG4gICAgICAub24oJ2Vycm9yJywgKGU6IGFueSkgPT4ge1xuICAgICAgICBsb2dnaW5nLmdldExvZ2dlcigpLmVycm9yKCdXZWJTb2NrZXQgWyVkXSBlcnJvclxcbiVqJywgc2Vzc2lvbi5pZCwgZSk7XG4gICAgICAgIGlmIChlLmNvZGUgPT09ICdFQ09OTlJFRlVTRUQnKSB7XG4gICAgICAgICAgLy8gVGhpcyBoYXBwZW5zIGluIHRoZSBmb2xsb3dpbmcgc2l0dWF0aW9uIC0tIG9sZCBrZXJuZWwgdGhhdCBoYXMgZ29uZVxuICAgICAgICAgIC8vIGF3YXkgbGlrZWx5IGR1ZSB0byBhIHJlc3RhcnQvc2h1dGRvd24uLi4gYW5kIGFuIG9sZCBub3RlYm9vayBjbGllbnRcbiAgICAgICAgICAvLyBhdHRlbXB0cyB0byByZWNvbm5lY3QgdG8gdGhlIG9sZCBrZXJuZWwuIFRoYXQgY29ubmVjdGlvbiB3aWxsIGJlXG4gICAgICAgICAgLy8gcmVmdXNlZC4gSW4gdGhpcyBjYXNlLCB0aGVyZSBpcyBubyBwb2ludCBpbiBrZWVwaW5nIHRoaXMgc29ja2V0LmlvXG4gICAgICAgICAgLy8gY29ubmVjdGlvbiBvcGVuLlxuICAgICAgICAgIHNlc3Npb24uc29ja2V0LmRpc2Nvbm5lY3QoLyogY2xvc2UgKi8gdHJ1ZSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gIHJldHVybiB3cztcbn1cblxuLyoqXG4gKiBDbG9zZXMgdGhlIFdlYlNvY2tldCBpbnN0YW5jZSBhc3NvY2lhdGVkIHdpdGggdGhlIHNlc3Npb24uXG4gKi9cbmZ1bmN0aW9uIGNsb3NlV2ViU29ja2V0KHNlc3Npb246IFNlc3Npb24pOiB2b2lkIHtcbiAgaWYgKHNlc3Npb24ud2ViU29ja2V0KSB7XG4gICAgc2Vzc2lvbi53ZWJTb2NrZXQuY2xvc2UoKTtcbiAgICBzZXNzaW9uLndlYlNvY2tldCA9IG51bGw7XG4gIH1cbn1cblxuLyoqXG4gKiBIYW5kbGVzIGNvbW11bmljYXRpb24gb3ZlciB0aGUgc3BlY2lmaWVkIHNvY2tldC5cbiAqL1xuZnVuY3Rpb24gc29ja2V0SGFuZGxlcihzb2NrZXQ6IFNvY2tldElPLlNvY2tldCkge1xuICBzZXNzaW9uQ291bnRlcisrO1xuXG4gIC8vIEVhY2ggc29ja2V0IGlzIGFzc29jaWF0ZWQgd2l0aCBhIHNlc3Npb24gdGhhdCB0cmFja3MgdGhlIGZvbGxvd2luZzpcbiAgLy8gLSBpZDogYSBjb3VudGVyIGZvciB1c2UgaW4gbG9nIG91dHB1dFxuICAvLyAtIHVybDogdGhlIHVybCB1c2VkIHRvIGNvbm5lY3QgdG8gdGhlIEp1cHl0ZXIgc2VydmVyXG4gIC8vIC0gc29ja2V0OiB0aGUgc29ja2V0LmlvIHNvY2tldCByZWZlcmVuY2UsIHdoaWNoIGdlbmVyYXRlcyBtZXNzYWdlXG4gIC8vICAgICAgICAgICBldmVudHMgZm9yIGFueXRoaW5nIHNlbnQgYnkgdGhlIGJyb3dzZXIgY2xpZW50LCBhbmQgYWxsb3dzXG4gIC8vICAgICAgICAgICBlbWl0dGluZyBtZXNzYWdlcyB0byBzZW5kIHRvIHRoZSBicm93c2VyXG4gIC8vIC0gd2ViU29ja2V0OiB0aGUgY29ycmVzcG9uZGluZyBXZWJTb2NrZXQgY29ubmVjdGlvbiB0byB0aGUgSnVweXRlclxuICAvLyAgICAgICAgICAgICAgc2VydmVyLlxuICAvLyBXaXRoaW4gYSBzZXNzaW9uLCBtZXNzYWdlcyByZWNpZXZlZCBvdmVyIHRoZSBzb2NrZXQuaW8gc29ja2V0IChmcm9tIHRoZVxuICAvLyBicm93c2VyKSBhcmUgcmVsYXllZCB0byB0aGUgV2ViU29ja2V0LCBhbmQgbWVzc2FnZXMgcmVjaWV2ZWQgb3ZlciB0aGVcbiAgLy8gV2ViU29ja2V0IHNvY2tldCBhcmUgcmVsYXllZCBiYWNrIHRvIHRoZSBzb2NrZXQuaW8gc29ja2V0ICh0byB0aGUgYnJvd3NlcikuXG4gIGNvbnN0IHNlc3Npb246XG4gICAgICBTZXNzaW9uID0ge2lkOiBzZXNzaW9uQ291bnRlciwgdXJsOiAnJywgc29ja2V0LCB3ZWJTb2NrZXQ6IG51bGx9O1xuXG4gIGxvZ2dpbmcuZ2V0TG9nZ2VyKCkuZGVidWcoJ1NvY2tldCBjb25uZWN0ZWQgZm9yIHNlc3Npb24gJWQnLCBzZXNzaW9uLmlkKTtcblxuICBzb2NrZXQub24oJ2Rpc2Nvbm5lY3QnLCAocmVhc29uKSA9PiB7XG4gICAgbG9nZ2luZy5nZXRMb2dnZXIoKS5kZWJ1ZyhcbiAgICAgICAgJ1NvY2tldCBkaXNjb25uZWN0ZWQgZm9yIHNlc3Npb24gJWQgcmVhc29uOiAlcycsIHNlc3Npb24uaWQsIHJlYXNvbik7XG5cbiAgICAvLyBIYW5kbGUgY2xpZW50IGRpc2Nvbm5lY3RzIHRvIGNsb3NlIFdlYlNvY2tldHMsIHNvIGFzIHRvIGZyZWUgdXAgcmVzb3VyY2VzXG4gICAgY2xvc2VXZWJTb2NrZXQoc2Vzc2lvbik7XG4gIH0pO1xuXG4gIHNvY2tldC5vbignc3RhcnQnLCAobWVzc2FnZTogU2Vzc2lvbk1lc3NhZ2UpID0+IHtcbiAgICBsb2dnaW5nLmdldExvZ2dlcigpLmRlYnVnKFxuICAgICAgICAnU3RhcnQgaW4gc2Vzc2lvbiAlZCB3aXRoIHVybCAlcycsIHNlc3Npb24uaWQsIG1lc3NhZ2UudXJsKTtcblxuICAgIHRyeSB7XG4gICAgICBsZXQgcG9ydCA9IGFwcFNldHRpbmdzLm5leHRKdXB5dGVyUG9ydDtcbiAgICAgIGlmIChhcHBTZXR0aW5ncy5rZXJuZWxNYW5hZ2VyUHJveHlQb3J0KSB7XG4gICAgICAgIHBvcnQgPSBhcHBTZXR0aW5ncy5rZXJuZWxNYW5hZ2VyUHJveHlQb3J0O1xuICAgICAgICBsb2dnaW5nLmdldExvZ2dlcigpLmRlYnVnKCdVc2luZyBrZXJuZWwgbWFuYWdlciBwcm94eSBwb3J0ICVkJywgcG9ydCk7XG4gICAgICB9XG4gICAgICBsZXQgaG9zdCA9ICdsb2NhbGhvc3QnO1xuICAgICAgaWYgKGFwcFNldHRpbmdzLmtlcm5lbE1hbmFnZXJQcm94eUhvc3QpIHtcbiAgICAgICAgaG9zdCA9IGFwcFNldHRpbmdzLmtlcm5lbE1hbmFnZXJQcm94eUhvc3Q7XG4gICAgICB9XG4gICAgICBzZXNzaW9uLnVybCA9IG1lc3NhZ2UudXJsO1xuICAgICAgc2Vzc2lvbi53ZWJTb2NrZXQgPSBjcmVhdGVXZWJTb2NrZXQoaG9zdCwgcG9ydCwgc2Vzc2lvbik7XG4gICAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6bm8tYW55XG4gICAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgICBsb2dnaW5nLmdldExvZ2dlcigpLmVycm9yKFxuICAgICAgICAgIGUsICdVbmFibGUgdG8gY3JlYXRlIFdlYlNvY2tldCBjb25uZWN0aW9uIHRvICVzJywgbWVzc2FnZS51cmwpO1xuICAgICAgc2Vzc2lvbi5zb2NrZXQuZGlzY29ubmVjdCgvKiBjbG9zZSAqLyB0cnVlKTtcbiAgICB9XG4gIH0pO1xuXG4gIHNvY2tldC5vbignc3RvcCcsIChtZXNzYWdlOiBTZXNzaW9uTWVzc2FnZSkgPT4ge1xuICAgIGxvZ2dpbmcuZ2V0TG9nZ2VyKCkuZGVidWcoXG4gICAgICAgICdTdG9wIGluIHNlc3Npb24gJWQgd2l0aCB1cmwgJXMnLCBzZXNzaW9uLmlkLCBtZXNzYWdlLnVybCk7XG5cbiAgICBjbG9zZVdlYlNvY2tldChzZXNzaW9uKTtcbiAgfSk7XG5cbiAgc29ja2V0Lm9uKCdkYXRhJywgKG1lc3NhZ2U6IERhdGFNZXNzYWdlKSA9PiB7XG4gICAgLy8gUHJvcGFnYXRlIHRoZSBtZXNzYWdlIG92ZXIgdG8gdGhlIFdlYlNvY2tldC5cbiAgICBpZiAoc2Vzc2lvbi53ZWJTb2NrZXQpIHtcbiAgICAgIGlmIChtZXNzYWdlIGluc3RhbmNlb2YgQnVmZmVyKSB7XG4gICAgICAgIGxvZ2dpbmcuZ2V0TG9nZ2VyKCkuZGVidWcoXG4gICAgICAgICAgICAnU2VuZCBiaW5hcnkgZGF0YSBvZiBsZW5ndGggJWQgaW4gc2Vzc2lvbiAlZC4nLCBtZXNzYWdlLmxlbmd0aCxcbiAgICAgICAgICAgIHNlc3Npb24uaWQpO1xuICAgICAgICBzZXNzaW9uLndlYlNvY2tldC5zZW5kKG1lc3NhZ2UsIChlKSA9PiB7XG4gICAgICAgICAgaWYgKGUpIHtcbiAgICAgICAgICAgIGxvZ2dpbmcuZ2V0TG9nZ2VyKCkuZXJyb3IoZSwgJ0ZhaWxlZCB0byBzZW5kIG1lc3NhZ2UgdG8gd2Vic29ja2V0Jyk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvZ2dpbmcuZ2V0TG9nZ2VyKCkuZGVidWcoXG4gICAgICAgICAgICAnU2VuZCBkYXRhIGluIHNlc3Npb24gJWRcXG4lcycsIHNlc3Npb24uaWQsIG1lc3NhZ2UuZGF0YSk7XG4gICAgICAgIHNlc3Npb24ud2ViU29ja2V0LnNlbmQobWVzc2FnZS5kYXRhLCAoZSkgPT4ge1xuICAgICAgICAgIGlmIChlKSB7XG4gICAgICAgICAgICBsb2dnaW5nLmdldExvZ2dlcigpLmVycm9yKGUsICdGYWlsZWQgdG8gc2VuZCBtZXNzYWdlIHRvIHdlYnNvY2tldCcpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGxvZ2dpbmcuZ2V0TG9nZ2VyKCkuZXJyb3IoXG4gICAgICAgICAgJ1VuYWJsZSB0byBzZW5kIG1lc3NhZ2U7IFdlYlNvY2tldCBpcyBub3Qgb3BlbicpO1xuICAgIH1cbiAgfSk7XG59XG5cbi8qKiBJbml0aWFsaXplIHRoZSBzb2NrZXRpbyBoYW5kbGVyLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGluaXQoXG4gICAgc2VydmVyOiBodHRwLlNlcnZlciwgc2V0dGluZ3M6IEFwcFNldHRpbmdzKTogU29ja2V0SU8uU2VydmVyIHtcbiAgYXBwU2V0dGluZ3MgPSBzZXR0aW5ncztcbiAgY29uc3QgaW8gPSBzb2NrZXRpbyhzZXJ2ZXIsIHtcbiAgICBwYXRoOiAnL3NvY2tldC5pbycsXG4gICAgdHJhbnNwb3J0czogWydwb2xsaW5nJ10sXG4gICAgYWxsb3dVcGdyYWRlczogZmFsc2UsXG4gICAgLy8gdjIuMTAgY2hhbmdlZCBkZWZhdWx0IGZyb20gNjBzIHRvIDVzLCBwcmVmZXIgdGhlIGxvbmdlciB0aW1lb3V0IHRvXG4gICAgLy8gYXZvaWQgZXJyYW50IGRpc2Nvbm5lY3RzLlxuICAgIHBpbmdUaW1lb3V0OiA2MDAwMCxcbiAgfSk7XG5cbiAgaW8ub2YoJy9zZXNzaW9uJykub24oJ2Nvbm5lY3Rpb24nLCBzb2NrZXRIYW5kbGVyKTtcbiAgcmV0dXJuIGlvO1xufVxuXG4vKiogUmV0dXJuIHRydWUgaWZmIHBhdGggaXMgaGFuZGxlZCBieSBzb2NrZXQuaW8uICovXG5leHBvcnQgZnVuY3Rpb24gaXNTb2NrZXRJb1BhdGgocGF0aDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHJldHVybiBwYXRoLmluZGV4T2YoJy9zb2NrZXQuaW8vJykgPT09IDA7XG59XG5cblxuLyoqXG4gKiBBIHNpbXBsZSBzb2NrZXQgYWJzdHJhY3Rpb24gdG8gc3VwcG9ydCB0cmFuc2l0aW9uaW5nIGZyb20gc29ja2V0LmlvIHRvXG4gKiB3ZWJzb2NrZXQuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU29ja2V0IHtcbiAgLyoqIFNlbmQgc3RyaW5nIGRhdGEuIFNpbGVudGx5IGRyb3BzIG1lc3NhZ2VzIGlmIG5vdCBjb25uZWN0ZWQuICovXG4gIHNlbmRTdHJpbmcoZGF0YTogc3RyaW5nKTogdm9pZDtcblxuICAvKiogU2VuZCBiaW5hcnkgZGF0YS4gU2lsZW50bHkgZHJvcHMgbWVzc2FnZXMgaWYgbm90IGNvbm5lY3RlZC4gKi9cbiAgc2VuZEJpbmFyeShkYXRhOiBBcnJheUJ1ZmZlcik6IHZvaWQ7XG5cbiAgLyoqXG4gICAqIENsb3NlIHRoZSBzb2NrZXQuXG4gICAqXG4gICAqIEBwYXJhbSBrZWVwVHJhbnNwb3J0T3BlbjogV2hlbiB0cnVlIGFuZCB0aGUgdW5kZXJseWluZyB0cmFuc3BvcnQgc3VwcG9ydHNcbiAgICogbXVsdGlwbGV4aW5nIHNvY2tldCBjb25uZWN0aW9ucywga2VlcCB0aGF0IHRyYW5zcG9ydCBvcGVuLlxuICAgKlxuICAgKi9cbiAgY2xvc2Uoa2VlcFRyYW5zcG9ydE9wZW46IGJvb2xlYW4pOiB2b2lkO1xuXG4gIC8qKiBMaXN0ZW4gZm9yIHNvY2tldCBjbG9zZSBldmVudHMuICovXG4gIG9uQ2xvc2UobGlzdGVuZXI6IChyZWFzb246IHN0cmluZykgPT4gdm9pZCk6IHZvaWQ7XG5cbiAgLyoqIExpc3RlbiBmb3Igc3RyaW5nIHR5cGUgZGF0YSByZWNlaXZlZCBldmVudHMuICovXG4gIG9uU3RyaW5nTWVzc2FnZShsaXN0ZW5lcjogKGRhdGE6IHN0cmluZykgPT4gdm9pZCk6IHZvaWQ7XG5cbiAgLyoqIExpc3RlbiBmb3IgYmluYXJ5IHR5cGUgZGF0YSByZWNlaXZlZCBldmVudHMuICovXG4gIG9uQmluYXJ5TWVzc2FnZShsaXN0ZW5lcjogKGRhdGE6IEJ1ZmZlcikgPT4gdm9pZCk6IHZvaWQ7XG59XG5cblxuLyoqIEEgYmFzZSBjbGFzcyBmb3Igc29ja2V0IGNsYXNzZXMgYWRhcHRpbmcgdG8gdGhlIFNvY2tldCBpbnRlcmZhY2UuICovXG5hYnN0cmFjdCBjbGFzcyBBZGFwdGVyIGltcGxlbWVudHMgU29ja2V0IHtcbiAgcHJvdGVjdGVkIHJlYWRvbmx5IGVtaXR0ZXIgPSBuZXcgRXZlbnRFbWl0dGVyKCk7XG5cbiAgYWJzdHJhY3Qgc2VuZFN0cmluZyhkYXRhOiBzdHJpbmcpOiB2b2lkO1xuXG4gIGFic3RyYWN0IHNlbmRCaW5hcnkoZGF0YTogQXJyYXlCdWZmZXIpOiB2b2lkO1xuXG4gIGFic3RyYWN0IGNsb3NlKGtlZXBUcmFuc3BvcnRPcGVuOiBib29sZWFuKTogdm9pZDtcblxuICBvbkNsb3NlKGxpc3RlbmVyOiAocmVhc29uOiBzdHJpbmcpID0+IHZvaWQpIHtcbiAgICB0aGlzLmVtaXR0ZXIub24oJ2Nsb3NlJywgbGlzdGVuZXIpO1xuICB9XG5cbiAgb25TdHJpbmdNZXNzYWdlKGxpc3RlbmVyOiAoZGF0YTogc3RyaW5nKSA9PiB2b2lkKSB7XG4gICAgdGhpcy5lbWl0dGVyLm9uKCdzdHJpbmdfbWVzc2FnZScsIGxpc3RlbmVyKTtcbiAgfVxuXG4gIG9uQmluYXJ5TWVzc2FnZShsaXN0ZW5lcjogKGRhdGE6IEJ1ZmZlcikgPT4gdm9pZCkge1xuICAgIHRoaXMuZW1pdHRlci5vbignYmluYXJ5X21lc3NhZ2UnLCBsaXN0ZW5lcik7XG4gIH1cbn1cblxuXG4vKiogQSBzb2NrZXQgYWRhcHRlciBmb3Igc29ja2V0LmlvLiAgKi9cbmV4cG9ydCBjbGFzcyBTb2NrZXRJT0FkYXB0ZXIgZXh0ZW5kcyBBZGFwdGVyIHtcbiAgY29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBzb2NrZXQ6IFNvY2tldElPLlNvY2tldCkge1xuICAgIHN1cGVyKCk7XG4gICAgdGhpcy5zb2NrZXQub24oJ2Vycm9yJywgKGVycikgPT4ge1xuICAgICAgbG9nZ2luZy5nZXRMb2dnZXIoKS5lcnJvcihgZXJyb3Igb24gc29ja2V0LmlvOiAke2Vycn1gKTtcbiAgICAgIC8vIEV2ZW50IHVuc3VwcG9ydGVkIGluIFNvY2tldC5cbiAgICB9KTtcblxuICAgIHRoaXMuc29ja2V0Lm9uKCdkaXNjb25uZWN0aW5nJywgKCkgPT4ge1xuICAgICAgbG9nZ2luZy5nZXRMb2dnZXIoKS5lcnJvcihgZGlzY29ubmVjdGluZyBzb2NrZXQuaW9gKTtcbiAgICAgIC8vIEV2ZW50IHVuc3VwcG9ydGVkIGluIFNvY2tldC5cbiAgICB9KTtcblxuICAgIHRoaXMuc29ja2V0Lm9uKCdkaXNjb25uZWN0JywgKHJlYXNvbikgPT4ge1xuICAgICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2Nsb3NlJywgcmVhc29uKTtcbiAgICB9KTtcblxuICAgIHRoaXMuc29ja2V0Lm9uKCdkYXRhJywgKGV2ZW50OiBEYXRhTWVzc2FnZXxCdWZmZXIpID0+IHtcbiAgICAgIGlmIChldmVudCBpbnN0YW5jZW9mIEJ1ZmZlcikge1xuICAgICAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnYmluYXJ5X21lc3NhZ2UnLCBldmVudCk7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBldmVudC5kYXRhID09PSAnc3RyaW5nJykge1xuICAgICAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnc3RyaW5nX21lc3NhZ2UnLCBldmVudC5kYXRhKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCdiaW5hcnlfbWVzc2FnZScsIGV2ZW50LmRhdGEpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgc2VuZFN0cmluZyhkYXRhOiBzdHJpbmcpIHtcbiAgICB0aGlzLnNvY2tldC5lbWl0KCdkYXRhJywge2RhdGF9KTtcbiAgfVxuXG4gIHNlbmRCaW5hcnkoZGF0YTogQXJyYXlCdWZmZXIpIHtcbiAgICB0aGlzLnNvY2tldC5lbWl0KCdkYXRhJywge2RhdGF9KTtcbiAgfVxuXG4gIGNsb3NlKGtlZXBUcmFuc3BvcnRPcGVuOiBib29sZWFuKSB7XG4gICAgdGhpcy5zb2NrZXQuZGlzY29ubmVjdCgha2VlcFRyYW5zcG9ydE9wZW4pO1xuICB9XG59XG5cbi8qKiBBIHNvY2tldCBhZGFwdGVyIGZvciB3ZWJzb2NrZXRzLiAgKi9cbmV4cG9ydCBjbGFzcyBXZWJTb2NrZXRBZGFwdGVyIGV4dGVuZHMgQWRhcHRlciB7XG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgd3M6IHdlYlNvY2tldCkge1xuICAgIHN1cGVyKCk7XG4gICAgdGhpcy53cy5vbignZXJyb3InLCAoZXJyKSA9PiB7XG4gICAgICBsb2dnaW5nLmdldExvZ2dlcigpLmVycm9yKGB3ZWJzb2NrZXQgZXJyb3I6ICR7ZXJyfWApO1xuICAgIH0pO1xuXG4gICAgdGhpcy53cy5vbignZGlzY29ubmVjdGluZycsICgpID0+IHtcbiAgICAgIGxvZ2dpbmcuZ2V0TG9nZ2VyKCkuZXJyb3IoYGRpc2Nvbm5lY3Rpbmcgd2Vic29ja2V0YCk7XG4gICAgICAvLyBFdmVudCB1bnN1cHBvcnRlZCBpbiBTb2NrZXQuXG4gICAgfSk7XG5cbiAgICB0aGlzLndzLm9uKCdjbG9zZScsIChjb2RlLCByZWFzb24pID0+IHtcbiAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCdjbG9zZScsIGBjb2RlOiR7Y29kZX0gcmVhc29uOiR7cmVhc29ufWApO1xuICAgIH0pO1xuXG4gICAgdGhpcy53cy5vbignbWVzc2FnZScsIChkYXRhKSA9PiB7XG4gICAgICBpZiAodHlwZW9mIGRhdGEgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCdzdHJpbmdfbWVzc2FnZScsIGRhdGEpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2JpbmFyeV9tZXNzYWdlJywgZGF0YSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICBzZW5kU3RyaW5nKGRhdGE6IHN0cmluZykge1xuICAgIGlmICh0aGlzLndzLnJlYWR5U3RhdGUgPT09IHdlYlNvY2tldC5PUEVOKSB7XG4gICAgICB0aGlzLndzLnNlbmQoZGF0YSk7XG4gICAgfVxuICB9XG5cbiAgc2VuZEJpbmFyeShkYXRhOiBBcnJheUJ1ZmZlcikge1xuICAgIGlmICh0aGlzLndzLnJlYWR5U3RhdGUgPT09IHdlYlNvY2tldC5PUEVOKSB7XG4gICAgICB0aGlzLndzLnNlbmQoZGF0YSk7XG4gICAgfVxuICB9XG5cbiAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOm5vLXVudXNlZC12YXJpYWJsZVxuICBjbG9zZShrZWVwVHJhbnNwb3J0T3BlbjogYm9vbGVhbikge1xuICAgIHRoaXMud3MuY2xvc2UoKTtcbiAgfVxufVxuIl19
