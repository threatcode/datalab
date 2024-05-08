"use strict";

var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DapServer = void 0;
var childProcess = require("child_process");
var crypto = require("crypto");
var net = require("net");
var ws_1 = require("ws");
var jsonRpc = require("./json_rpc");
var logging = require("./logging");
var sockets_1 = require("./sockets");
var sessionCounter = 0;
/** Socket<->debug adapter. */
var Session = /** @class */ (function () {
    function Session(clientSocket, domainSocketPath) {
        var _this = this;
        this.clientSocket = clientSocket;
        this.id = sessionCounter++;
        this.clientSocket.onClose(function (reason) {
            logging.getLogger().debug('DAP socket disconnected for session %d reason: %s', _this.id, reason);
            // Handle client disconnects to close sockets, so as to free up resources.
            _this.close();
        });
        this.connect(domainSocketPath);
    }
    Session.prototype.close = function () {
        if (this.dapSocket) {
            this.dapSocket.destroy();
        }
        this.clientSocket.close(true);
    };
    Session.prototype.connect = function (domainSocketPath) {
        return __awaiter(this, void 0, Promise, function () {
            var rpc_1, dapSocket_1, message, error_1;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        logging.getLogger().info('DAP creating Socket to %s for session %d', domainSocketPath, this.id);
                        rpc_1 = new jsonRpc.JsonRpcReader(function (dapMessage) {
                            var message = { data: jsonRpc.encodeJsonRpc(dapMessage.content) };
                            _this.clientSocket.sendString(JSON.stringify(message));
                        });
                        dapSocket_1 = new net.Socket();
                        this.dapSocket = dapSocket_1;
                        dapSocket_1.on('data', function (data) {
                            rpc_1.append(data);
                        });
                        dapSocket_1.on('close', function () {
                            _this.close();
                        });
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                dapSocket_1.on('error', reject);
                                dapSocket_1.connect(domainSocketPath, resolve);
                            })];
                    case 1:
                        _a.sent();
                        message = { open: true };
                        this.clientSocket.sendString(JSON.stringify(message));
                        this.clientSocket.onBinaryMessage(function (data) {
                            dapSocket_1.write(Uint8Array.from(data));
                        });
                        this.clientSocket.onStringMessage(function (data) {
                            dapSocket_1.write(data);
                        });
                        return [3 /*break*/, 3];
                    case 2:
                        error_1 = _a.sent();
                        logging.getLogger().error('Error connecting to Debug Adapter: %s', error_1);
                        this.close();
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    return Session;
}());
/** Debug Adapter Protocol server. */
var DapServer = /** @class */ (function () {
    function DapServer(muxBinary, server) {
        var _this = this;
        this.portPromise = this.spawnMultiplexer(muxBinary);
        server === null || server === void 0 ? void 0 : server.of('/debugger').on('connection', function (socket) {
            _this.portPromise.then(function (domainSocketPath) {
                // Session manages its own lifetime.
                // tslint:disable-next-line:no-unused-expression
                new Session(new sockets_1.SocketIOAdapter(socket), domainSocketPath);
            });
        });
    }
    DapServer.prototype.handleUpgrade = function (request, sock, head) {
        var _this = this;
        new ws_1.Server({ noServer: true }).handleUpgrade(request, sock, head, function (ws) {
            _this.portPromise.then(function (domainSocketPath) {
                // Session manages its own lifetime.
                // tslint:disable-next-line:no-unused-expression
                new Session(new sockets_1.WebSocketAdapter(ws), domainSocketPath);
            });
        });
    };
    DapServer.prototype.spawnMultiplexer = function (muxBinary) {
        return __awaiter(this, void 0, Promise, function () {
            var filename, muxProcess, muxOutput;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        filename = "/tmp/debugger_".concat(crypto.randomBytes(6).readUIntLE(0, 6).toString(36));
                        muxProcess = childProcess.spawn(muxBinary, [
                            "--domain_socket_path=".concat(filename),
                        ]);
                        muxProcess.stdout.on('data', function (data) {
                            logging.getLogger().info('%s: %s', muxBinary, data);
                        });
                        muxProcess.stdout.on('error', function (data) {
                            logging.getLogger().info('%s: %s', muxBinary, data);
                        });
                        muxOutput = '';
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                var connectionHandler = function (data) {
                                    muxOutput += data;
                                    // Wait for the process to indicate that it is listening.
                                    if (muxOutput.match(/Listening on /)) {
                                        muxProcess.stdout.off('data', connectionHandler);
                                        resolve();
                                    }
                                };
                                muxProcess.stdout.on('data', connectionHandler);
                                muxProcess.stdout.on('error', reject);
                            })];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, filename];
                }
            });
        });
    };
    return DapServer;
}());
exports.DapServer = DapServer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic29ja2V0aW9fdG9fZGFwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vdGhpcmRfcGFydHkvY29sYWIvc291cmNlcy9zb2NrZXRpb190b19kYXAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7OztHQWNHOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFSCw0Q0FBOEM7QUFDOUMsK0JBQWlDO0FBRWpDLHlCQUEyQjtBQUkzQix5QkFBMEI7QUFFMUIsb0NBQXNDO0FBQ3RDLG1DQUFxQztBQUNyQyxxQ0FBb0U7QUFFcEUsSUFBSSxjQUFjLEdBQUcsQ0FBQyxDQUFDO0FBRXZCLDhCQUE4QjtBQUM5QjtJQUlFLGlCQUE2QixZQUFvQixFQUFFLGdCQUF3QjtRQUEzRSxpQkFZQztRQVo0QixpQkFBWSxHQUFaLFlBQVksQ0FBUTtRQUMvQyxJQUFJLENBQUMsRUFBRSxHQUFHLGNBQWMsRUFBRSxDQUFDO1FBRTNCLElBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLFVBQUMsTUFBTTtZQUMvQixPQUFPLENBQUMsU0FBUyxFQUFFLENBQUMsS0FBSyxDQUNyQixtREFBbUQsRUFBRSxLQUFJLENBQUMsRUFBRSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBRTFFLDBFQUEwRTtZQUMxRSxLQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDZixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztJQUNqQyxDQUFDO0lBRU8sdUJBQUssR0FBYjtRQUNFLElBQUksSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ25CLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDM0IsQ0FBQztRQUNELElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2hDLENBQUM7SUFFYSx5QkFBTyxHQUFy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QUFDO3dCQUNuQixxQkFBTSxJQUFJLE9BQU8sQ0FBTyxVQUFDLE9BQU8sRUFBRSxNQUFNO2dDQUN0QyxJQUFNLGlCQUFpQixHQUFHLFVBQUMsSUFBWTtvQ0FDckMsU0FBUyxJQUFJLElBQUksQ0FBQztvQ0FDbEIseURBQXlEO29DQUN6RCxJQUFJLFNBQVMsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQzt3Q0FDckMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLGlCQUFpQixDQUFDLENBQUM7d0NBQ2pELE9BQU8sRUFBRSxDQUFDO29DQUNaLENBQUM7Z0NBQ0gsQ0FBQyxDQUFDO2dDQUNGLFVBQVUsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO2dDQUNoRCxVQUFVLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLENBQUM7NEJBQ3hDLENBQUMsQ0FBQyxFQUFBOzt3QkFYRixTQVdFLENBQUM7d0JBQ0gsc0JBQU8sUUFBUSxFQUFDOzs7O0tBQ2pCO0lBQ0gsZ0JBQUM7QUFBRCxDQUFDLEFBckRELElBcURDO0FBckRZLDhCQUFTIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAyMDIwIEdvb2dsZSBJbmMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKlxuICogTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTsgeW91IG1heSBub3RcbiAqIHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS4gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mXG4gKiB0aGUgTGljZW5zZSBhdFxuICpcbiAqIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuICpcbiAqIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbiAqIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUywgV0lUSE9VVFxuICogV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLiBTZWUgdGhlXG4gKiBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZCBsaW1pdGF0aW9ucyB1bmRlclxuICogdGhlIExpY2Vuc2UuXG4gKi9cblxuaW1wb3J0ICogYXMgY2hpbGRQcm9jZXNzIGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0ICogYXMgY3J5cHRvIGZyb20gJ2NyeXB0byc7XG5pbXBvcnQgKiBhcyBodHRwIGZyb20gJ2h0dHAnO1xuaW1wb3J0ICogYXMgbmV0IGZyb20gJ25ldCc7XG4vLyBUaGUgdW51c3VhbCBjYXNpbmcgaXMgZnJvbSB1cHN0cmVhbSBTb2NrZXRJTy5cbi8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTplbmZvcmNlLW5hbWUtY2FzaW5nXG5pbXBvcnQgKiBhcyBTb2NrZXRJTyBmcm9tICdzb2NrZXQuaW8nO1xuaW1wb3J0IHtTZXJ2ZXJ9IGZyb20gJ3dzJztcblxuaW1wb3J0ICogYXMganNvblJwYyBmcm9tICcuL2pzb25fcnBjJztcbmltcG9ydCAqIGFzIGxvZ2dpbmcgZnJvbSAnLi9sb2dnaW5nJztcbmltcG9ydCB7U29ja2V0LCBTb2NrZXRJT0FkYXB0ZXIsIFdlYlNvY2tldEFkYXB0ZXJ9IGZyb20gJy4vc29ja2V0cyc7XG5cbmxldCBzZXNzaW9uQ291bnRlciA9IDA7XG5cbi8qKiBTb2NrZXQ8LT5kZWJ1ZyBhZGFwdGVyLiAqL1xuY2xhc3MgU2Vzc2lvbiB7XG4gIHByaXZhdGUgcmVhZG9ubHkgaWQ6IG51bWJlcjtcbiAgcHJpdmF0ZSBkYXBTb2NrZXQ/OiBuZXQuU29ja2V0O1xuXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgY2xpZW50U29ja2V0OiBTb2NrZXQsIGRvbWFpblNvY2tldFBhdGg6IHN0cmluZykge1xuICAgIHRoaXMuaWQgPSBzZXNzaW9uQ291bnRlcisrO1xuXG4gICAgdGhpcy5jbGllbnRTb2NrZXQub25DbG9zZSgocmVhc29uKSA9PiB7XG4gICAgICBsb2dnaW5nLmdldExvZ2dlcigpLmRlYnVnKFxuICAgICAgICAgICdEQVAgc29ja2V0IGRpc2Nvbm5lY3RlZCBmb3Igc2Vzc2lvbiAlZCByZWFzb246ICVzJywgdGhpcy5pZCwgcmVhc29uKTtcblxuICAgICAgLy8gSGFuZGxlIGNsaWVudCBkaXNjb25uZWN0cyB0byBjbG9zZSBzb2NrZXRzLCBzbyBhcyB0byBmcmVlIHVwIHJlc291cmNlcy5cbiAgICAgIHRoaXMuY2xvc2UoKTtcbiAgICB9KTtcblxuICAgIHRoaXMuY29ubmVjdChkb21haW5Tb2NrZXRQYXRoKTtcbiAgfVxuXG4gIHByaXZhdGUgY2xvc2UoKSB7XG4gICAgaWYgKHRoaXMuZGFwU29ja2V0KSB7XG4gICAgICB0aGlzLmRhcFNvY2tldC5kZXN0cm95KCk7XG4gICAgfVxuICAgIHRoaXMuY2xpZW50U29ja2V0LmNsb3NlKHRydWUpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjb25uZWN0KGRvbWFpblNvY2tldFBhdGg6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyeSB7XG4gICAgICBsb2dnaW5nLmdldExvZ2dlcigpLmluZm8oXG4gICAgICAgICAgJ0RBUCBjcmVhdGluZyBTb2NrZXQgdG8gJXMgZm9yIHNlc3Npb24gJWQnLCBkb21haW5Tb2NrZXRQYXRoLFxuICAgICAgICAgIHRoaXMuaWQpO1xuXG4gICAgICBjb25zdCBycGMgPSBuZXcganNvblJwYy5Kc29uUnBjUmVhZGVyKChkYXBNZXNzYWdlKSA9PiB7XG4gICAgICAgIGNvbnN0IG1lc3NhZ2U6XG4gICAgICAgICAgICBPdXRnb2luZ01lc3NhZ2UgPSB7ZGF0YToganNvblJwYy5lbmNvZGVKc29uUnBjKGRhcE1lc3NhZ2UuY29udGVudCl9O1xuICAgICAgICB0aGlzLmNsaWVudFNvY2tldC5zZW5kU3RyaW5nKEpTT04uc3RyaW5naWZ5KG1lc3NhZ2UpKTtcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBkYXBTb2NrZXQgPSBuZXcgbmV0LlNvY2tldCgpO1xuICAgICAgdGhpcy5kYXBTb2NrZXQgPSBkYXBTb2NrZXQ7XG4gICAgICBkYXBTb2NrZXQub24oJ2RhdGEnLCAoZGF0YTogQnVmZmVyKSA9PiB7XG4gICAgICAgIHJwYy5hcHBlbmQoZGF0YSk7XG4gICAgICB9KTtcbiAgICAgIGRhcFNvY2tldC5vbignY2xvc2UnLCAoKSA9PiB7XG4gICAgICAgIHRoaXMuY2xvc2UoKTtcbiAgICAgIH0pO1xuICAgICAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICBkYXBTb2NrZXQub24oJ2Vycm9yJywgcmVqZWN0KTtcbiAgICAgICAgZGFwU29ja2V0LmNvbm5lY3QoZG9tYWluU29ja2V0UGF0aCwgcmVzb2x2ZSk7XG4gICAgICB9KTtcblxuICAgICAgLy8gTm90aWZ5IHRoZSBjbGllbnQgdGhhdCB0aGUgY29ubmVjdGlvbi5pcyBub3cgb3Blbi5cbiAgICAgIGNvbnN0IG1lc3NhZ2U6IE91dGdvaW5nTWVzc2FnZSA9IHtvcGVuOiB0cnVlfTtcbiAgICAgIHRoaXMuY2xpZW50U29ja2V0LnNlbmRTdHJpbmcoSlNPTi5zdHJpbmdpZnkobWVzc2FnZSkpO1xuICAgICAgdGhpcy5jbGllbnRTb2NrZXQub25CaW5hcnlNZXNzYWdlKChkYXRhOiBCdWZmZXIpID0+IHtcbiAgICAgICAgZGFwU29ja2V0LndyaXRlKFVpbnQ4QXJyYXkuZnJvbShkYXRhKSk7XG4gICAgICB9KTtcbiAgICAgIHRoaXMuY2xpZW50U29ja2V0Lm9uU3RyaW5nTWVzc2FnZSgoZGF0YTogc3RyaW5nKSA9PiB7XG4gICAgICAgIGRhcFNvY2tldC53cml0ZShkYXRhKTtcbiAgICAgIH0pO1xuICAgICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOm5vLWFueVxuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgIGxvZ2dpbmcuZ2V0TG9nZ2VyKCkuZXJyb3IoJ0Vycm9yIGNvbm5lY3RpbmcgdG8gRGVidWcgQWRhcHRlcjogJXMnLCBlcnJvcik7XG4gICAgICB0aGlzLmNsb3NlKCk7XG4gICAgfVxuICB9XG59XG5cbi8qKiBEZWJ1ZyBBZGFwdGVyIFByb3RvY29sIHNlcnZlci4gKi9cbmV4cG9ydCBjbGFzcyBEYXBTZXJ2ZXIge1xuICBwcml2YXRlIHJlYWRvbmx5IHBvcnRQcm9taXNlOiBQcm9taXNlPHN0cmluZz47XG4gIGNvbnN0cnVjdG9yKG11eEJpbmFyeTogc3RyaW5nLCBzZXJ2ZXI/OiBTb2NrZXRJTy5TZXJ2ZXIpIHtcbiAgICB0aGlzLnBvcnRQcm9taXNlID0gdGhpcy5zcGF3bk11bHRpcGxleGVyKG11eEJpbmFyeSk7XG5cbiAgICBzZXJ2ZXI/Lm9mKCcvZGVidWdnZXInKS5vbignY29ubmVjdGlvbicsIChzb2NrZXQ6IFNvY2tldElPLlNvY2tldCkgPT4ge1xuICAgICAgdGhpcy5wb3J0UHJvbWlzZS50aGVuKChkb21haW5Tb2NrZXRQYXRoKSA9PiB7XG4gICAgICAgIC8vIFNlc3Npb24gbWFuYWdlcyBpdHMgb3duIGxpZmV0aW1lLlxuICAgICAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6bm8tdW51c2VkLWV4cHJlc3Npb25cbiAgICAgICAgbmV3IFNlc3Npb24obmV3IFNvY2tldElPQWRhcHRlcihzb2NrZXQpLCBkb21haW5Tb2NrZXRQYXRoKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgaGFuZGxlVXBncmFkZShyZXF1ZXN0OiBodHRwLkluY29taW5nTWVzc2FnZSwgc29jazogbmV0LlNvY2tldCwgaGVhZDogQnVmZmVyKSB7XG4gICAgbmV3IFNlcnZlcih7bm9TZXJ2ZXI6IHRydWV9KS5oYW5kbGVVcGdyYWRlKHJlcXVlc3QsIHNvY2ssIGhlYWQsICh3cykgPT4ge1xuICAgICAgdGhpcy5wb3J0UHJvbWlzZS50aGVuKChkb21haW5Tb2NrZXRQYXRoKSA9PiB7XG4gICAgICAgIC8vIFNlc3Npb24gbWFuYWdlcyBpdHMgb3duIGxpZmV0aW1lLlxuICAgICAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6bm8tdW51c2VkLWV4cHJlc3Npb25cbiAgICAgICAgbmV3IFNlc3Npb24obmV3IFdlYlNvY2tldEFkYXB0ZXIod3MpLCBkb21haW5Tb2NrZXRQYXRoKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBzcGF3bk11bHRpcGxleGVyKG11eEJpbmFyeTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBjb25zdCBmaWxlbmFtZSA9XG4gICAgICAgIGAvdG1wL2RlYnVnZ2VyXyR7Y3J5cHRvLnJhbmRvbUJ5dGVzKDYpLnJlYWRVSW50TEUoMCwgNikudG9TdHJpbmcoMzYpfWA7XG4gICAgY29uc3QgbXV4UHJvY2VzcyA9IGNoaWxkUHJvY2Vzcy5zcGF3bihtdXhCaW5hcnksIFtcbiAgICAgIGAtLWRvbWFpbl9zb2NrZXRfcGF0aD0ke2ZpbGVuYW1lfWAsXG4gICAgXSk7XG5cbiAgICBtdXhQcm9jZXNzLnN0ZG91dC5vbignZGF0YScsIChkYXRhOiBzdHJpbmcpID0+IHtcbiAgICAgIGxvZ2dpbmcuZ2V0TG9nZ2VyKCkuaW5mbygnJXM6ICVzJywgbXV4QmluYXJ5LCBkYXRhKTtcbiAgICB9KTtcbiAgICBtdXhQcm9jZXNzLnN0ZG91dC5vbignZXJyb3InLCAoZGF0YTogc3RyaW5nKSA9PiB7XG4gICAgICBsb2dnaW5nLmdldExvZ2dlcigpLmluZm8oJyVzOiAlcycsIG11eEJpbmFyeSwgZGF0YSk7XG4gICAgfSk7XG5cbiAgICBsZXQgbXV4T3V0cHV0ID0gJyc7XG4gICAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgY29uc3QgY29ubmVjdGlvbkhhbmRsZXIgPSAoZGF0YTogc3RyaW5nKSA9PiB7XG4gICAgICAgIG11eE91dHB1dCArPSBkYXRhO1xuICAgICAgICAvLyBXYWl0IGZvciB0aGUgcHJvY2VzcyB0byBpbmRpY2F0ZSB0aGF0IGl0IGlzIGxpc3RlbmluZy5cbiAgICAgICAgaWYgKG11eE91dHB1dC5tYXRjaCgvTGlzdGVuaW5nIG9uIC8pKSB7XG4gICAgICAgICAgbXV4UHJvY2Vzcy5zdGRvdXQub2ZmKCdkYXRhJywgY29ubmVjdGlvbkhhbmRsZXIpO1xuICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICAgIG11eFByb2Nlc3Muc3Rkb3V0Lm9uKCdkYXRhJywgY29ubmVjdGlvbkhhbmRsZXIpO1xuICAgICAgbXV4UHJvY2Vzcy5zdGRvdXQub24oJ2Vycm9yJywgcmVqZWN0KTtcbiAgICB9KTtcbiAgICByZXR1cm4gZmlsZW5hbWU7XG4gIH1cbn1cblxuZGVjbGFyZSBpbnRlcmZhY2UgT3V0Z29pbmdNZXNzYWdlIHtcbiAgcmVhZG9ubHkgZGF0YT86IHN0cmluZztcbiAgcmVhZG9ubHkgb3Blbj86IGJvb2xlYW47XG59XG4iXX0=
