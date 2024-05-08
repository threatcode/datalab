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
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketToLsp = exports.SocketIOToLsp = void 0;
var bunyan = require("bunyan");
var childProcess = require("child_process");
var crypto_1 = require("crypto");
var fs = require("fs");
var os = require("os");
var path = require("path");
var ws_1 = require("ws");
var jsonRpc = require("./json_rpc");
var logging = require("./logging");
var protocol = require("./lsp/protocol_node");
var sockets_1 = require("./sockets");
// We import the bunyan-rotating-file-stream package, which exports a
// constructor as a single object; we use lint disables here to make the usage
// below look reasonable.
//
// tslint:disable-next-line:no-require-imports variable-name enforce-name-casing
var RotatingFileStream = require('bunyan-rotating-file-stream');
var sessionCounter = 0;
var activeCount = 0;
/** Socket<->pyright LSP. */
var Session = /** @class */ (function () {
    function Session(socket, rootDirectory, contentDirectory, logsDir, pipLogsDir, proxyBinaryPath, proxyBinaryArgs) {
        var _this = this;
        this.socket = socket;
        this.closed = false;
        this.id = sessionCounter++;
        ++activeCount;
        var logPath = path.join(logsDir, "/lsp.".concat(sessionCounter, ".log"));
        this.consoleLogger = logging.getLogger();
        this.consoleLogger.info("LSP ".concat(this.id, " new session, ").concat(activeCount, " now active"));
        this.lspLogger = bunyan.createLogger({
            name: 'lsp',
            streams: [{
                    level: 'info',
                    stream: new RotatingFileStream({
                        path: logPath,
                        rotateExisting: false,
                        threshold: '2m',
                        totalSize: '20m'
                    }),
                }],
        });
        delete this.lspLogger.fields['hostname'];
        delete this.lspLogger.fields['name'];
        this.cancellation = new FileBasedCancellation(this.lspLogger);
        // To test against locally built versions of Pyright see the docs:
        // https://github.com/microsoft/pyright/blob/main/docs/build-debug.md
        //
        // You'll want to change the path to point to your local Pyright code e.g.
        // ${HOME}/pyright/packages/pyright/langserver.index.js
        //
        // Then from within the Pyright root folder rebuild the sources with:
        // npm run build:cli:dev
        var processName = 'node';
        var processArgs = [
            path.join(contentDirectory, '..', 'datalab', 'web', 'pyright', 'pyright-langserver.js'),
            // Using stdin/stdout for passing messages.
            '--stdio',
            // Use file-based cancellation to allow background analysis.
            "--cancellationReceive=file:".concat(this.cancellation.folderName),
        ];
        if (proxyBinaryPath) {
            processArgs.unshift(processName);
            processArgs.unshift('--');
            if (proxyBinaryArgs) {
                processArgs.unshift.apply(processArgs, __spreadArray([], __read(proxyBinaryArgs), false));
            }
            processName = proxyBinaryPath;
        }
        this.pyright = childProcess.spawn(processName, processArgs, {
            stdio: ['pipe'],
            cwd: rootDirectory,
        });
        fs.writeFile("/proc/".concat(this.pyright.pid, "/oom_score_adj"), '1000', function (error) {
            if (error) {
                _this.consoleLogger.error(error, "LSP set oom_score_adj");
                return;
            }
        });
        var rpc = new jsonRpc.JsonRpcReader(function (message) {
            if (!_this.processLanguageServerMessage(message.content)) {
                _this.lspLogger.info('c<--s' + message.content);
                _this.socket.sendString(message.content);
            }
            else {
                _this.lspLogger.info(' <--s' + message.content);
            }
        });
        var encoder = new TextEncoder();
        this.pyright.stdout.on('data', function (data) {
            if (_this.closed) {
                return;
            }
            try {
                rpc.append(encoder.encode(data));
            }
            catch (error) {
                _this.consoleLogger.error("LSP ".concat(_this.id, " error handling pyright data: ").concat(error));
            }
        });
        this.pyright.stderr.on('data', function (data) {
            var out = data.toString().replace(/\n$/, '');
            _this.consoleLogger.error("LSP ".concat(_this.id, " pyright error console: ").concat(out));
        });
        this.pyright.on('error', function (data) {
            _this.consoleLogger.error("LSP ".concat(_this.id, " pyright error: ").concat(data));
            _this.close();
        });
        this.socket.onClose(function (reason) {
            _this.consoleLogger.debug("LSP ".concat(_this.id, " Socket disconnected for reason: \"%s\""), reason);
            // Handle client disconnects to close sockets, so as to free up resources.
            _this.close();
        });
        this.socket.onStringMessage(function (data) {
            if (_this.closed) {
                return;
            }
            _this.handleDataFromClient(data);
        });
        try {
            this.pipLogWatcher = fs.watch(pipLogsDir, {
                recursive: false,
            }, function (event, filename) {
                if (filename === 'pip.log') {
                    _this.pipLogChanged();
                }
            });
        }
        catch (error) {
            this.consoleLogger.error("LSP ".concat(this.id, " Error starting pip.log watcher: %s"), error);
        }
    }
    Session.prototype.handleDataFromClient = function (data) {
        if (this.closed) {
            return;
        }
        try {
            this.lspLogger.info('c-->s' + data);
            // tslint:disable-next-line:no-any
            var message = JSON.parse(data);
            if (message.method === 'initialize') {
                // Patch the processId to be this one since the client does not does
                // not know about this process ID.
                message.params.processId = process.pid;
            }
            var json = JSON.stringify(message);
            json = json.replace(/[\u007F-\uFFFF]/g, function (chr) {
                // Replace non-ASCII characters with unicode encodings to avoid issues
                // sending unicode characters through stdin.
                // We don't need to handle surrogate pairs as these won't be a single
                // character in the JSON.
                return '\\u' + ('0000' + chr.charCodeAt(0).toString(16)).substr(-4);
            });
            this.pyright.stdin.write(jsonRpc.encodeJsonRpc(json));
        }
        catch (error) {
            // Errors propagated from here will disconnect the kernel.
            this.consoleLogger.error("LSP ".concat(this.id, " Socket error writing %s"), String(error));
            this.close();
        }
    };
    /** @return True if the message is consumed and should not be forwarded. */
    Session.prototype.processLanguageServerMessage = function (data) {
        try {
            var message = JSON.parse(data);
            if ('id' in message) {
                if ('method' in message && 'params' in message) {
                    this.handleRequest(message);
                }
                else {
                    this.handleResponse(message);
                }
            }
            else {
                return this.handleNotification(message);
            }
        }
        catch (error) {
            this.consoleLogger.error("LSP ".concat(this.id, " Error processing message: %s from \"%s\""), error, data);
        }
        return false;
    };
    /** @return True if the message is consumed and should not be forwarded. */
    Session.prototype.handleNotification = function (notification) {
        if (notification.method === protocol.Method.CancelRequest) {
            var cancellation = notification;
            this.cancellation.cancel(cancellation.params.id);
        }
        else if (notification.method === 'pyright/beginProgress' ||
            notification.method === 'pyright/reportProgress' ||
            notification.method === 'pyright/endProgress') {
            // Colab doesn't use these progress messages right now and they just
            // congest socket.io during completion flows.
            return true;
        }
        return false;
    };
    Session.prototype.handleRequest = function (request) {
        // Nothing to do here yet.
    };
    Session.prototype.handleResponse = function (response) {
        if (response.error &&
            response.error.code === protocol.ErrorCode.RequestCancelled &&
            response.id) {
            this.cancellation.cleanup(response.id);
        }
    };
    Session.prototype.pipLogChanged = function () {
        this.sendNotificationToClient(protocol.Method.ColabPipLogChanged, {});
    };
    Session.prototype.sendNotificationToClient = function (method, params) {
        if (this.closed) {
            return;
        }
        var json = {
            method: method,
            params: params,
            jsonrpc: '2.0',
        };
        var data = JSON.stringify(json);
        this.lspLogger.info('c<--s' + data);
        this.socket.sendString(data);
    };
    Session.prototype.close = function () {
        if (this.closed) {
            return;
        }
        this.closed = true;
        this.socket.close(true);
        // Force-kill pyright process to ensure full shutdown.
        // The process should effectively be read-only where it does not generate
        // any data other than what is sent back to this process.
        this.pyright.kill(9);
        if (this.pipLogWatcher) {
            this.pipLogWatcher.close();
        }
        this.cancellation.dispose();
        --activeCount;
        this.consoleLogger.info("LSP ".concat(this.id, " closed session, ").concat(activeCount, " remaining active"));
    };
    return Session;
}());
/** SocketIO to PyRight adapter. */
var SocketIOToLsp = /** @class */ (function () {
    function SocketIOToLsp(server, rootDirectory, contentDirectory, logsDir, pipLogsDir, languageServerProxy, languageServerProxyArgs) {
        // Cast to string is because the typings are missing the regexp override.
        // Documented in https://socket.io/docs/v2/namespaces/.
        server.of(new RegExp('/python-lsp/.*'))
            .on('connection', function (socket) {
            var proxyBinaryPath;
            var proxyBinaryArgs;
            if (languageServerProxy) {
                proxyBinaryPath = languageServerProxy;
                proxyBinaryArgs = languageServerProxyArgs;
            }
            // Session manages its own lifetime.
            // tslint:disable-next-line:no-unused-expression
            new Session(new sockets_1.SocketIOAdapter(socket), rootDirectory, contentDirectory, logsDir, pipLogsDir, proxyBinaryPath, proxyBinaryArgs);
        });
    }
    return SocketIOToLsp;
}());
exports.SocketIOToLsp = SocketIOToLsp;
var FileBasedCancellation = /** @class */ (function () {
    function FileBasedCancellation(logger) {
        this.logger = logger;
        this.folderName = (0, crypto_1.randomBytes)(21).toString('hex');
        // This must match the naming used in:
        // https://github.com/microsoft/pyright/blob/7bb059ecbab5c0c446d4dcf5376fc5ce8bd8cd26/packages/pyright-internal/src/common/cancellationUtils.ts#L189
        this.folderPath = path.join(os.tmpdir(), 'python-languageserver-cancellation', this.folderName);
        fs.mkdirSync(this.folderPath, { recursive: true });
    }
    FileBasedCancellation.prototype.cancel = function (id) {
        var _this = this;
        fs.promises.writeFile(this.getCancellationPath(id), '', { flag: 'w' })
            .catch(function (error) {
            _this.logger.error(error, "LSP FileBasedCancellation.cancel");
        });
    };
    FileBasedCancellation.prototype.cleanup = function (id) {
        var _this = this;
        fs.promises.unlink(this.getCancellationPath(id)).catch(function (error) {
            _this.logger.error(error, "LSP FileBasedCancellation.cleanup");
        });
    };
    FileBasedCancellation.prototype.dispose = function () {
        return __awaiter(this, void 0, void 0, function () {
            var files, files_1, files_1_1, file, error_1, e_1_1, error_2;
            var e_1, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 13, , 14]);
                        return [4 /*yield*/, fs.promises.readdir(this.folderPath)];
                    case 1:
                        files = _b.sent();
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, 9, 10, 11]);
                        files_1 = __values(files), files_1_1 = files_1.next();
                        _b.label = 3;
                    case 3:
                        if (!!files_1_1.done) return [3 /*break*/, 8];
                        file = files_1_1.value;
                        _b.label = 4;
                    case 4:
                        _b.trys.push([4, 6, , 7]);
                        return [4 /*yield*/, fs.promises.unlink(path.join(this.folderPath, file))];
                    case 5:
                        _b.sent();
                        return [3 /*break*/, 7];
                    case 6:
                        error_1 = _b.sent();
                        this.logger.error(error_1, "LSP FileBasedCancellation.dispose");
                        return [3 /*break*/, 7];
                    case 7:
                        files_1_1 = files_1.next();
                        return [3 /*break*/, 3];
                    case 8: return [3 /*break*/, 11];
                    case 9:
                        e_1_1 = _b.sent();
                        e_1 = { error: e_1_1 };
                        return [3 /*break*/, 11];
                    case 10:
                        try {
                            if (files_1_1 && !files_1_1.done && (_a = files_1.return)) _a.call(files_1);
                        }
                        finally { if (e_1) throw e_1.error; }
                        return [7 /*endfinally*/];
                    case 11: return [4 /*yield*/, fs.promises.rmdir(this.folderPath)];
                    case 12:
                        _b.sent();
                        return [3 /*break*/, 14];
                    case 13:
                        error_2 = _b.sent();
                        this.logger.error(error_2, "LSP FileBasedCancellation.dispose");
                        return [3 /*break*/, 14];
                    case 14: return [2 /*return*/];
                }
            });
        });
    };
    FileBasedCancellation.prototype.getCancellationPath = function (id) {
        // This must match the naming used in:
        // https://github.com/microsoft/pyright/blob/7bb059ecbab5c0c446d4dcf5376fc5ce8bd8cd26/packages/pyright-internal/src/common/cancellationUtils.ts#L193
        return path.join(this.folderPath, "cancellation-".concat(id, ".tmp"));
    };
    return FileBasedCancellation;
}());
/** Websocket to PyRight adapter. */
function WebSocketToLsp(request, sock, head, rootDirectory, contentDirectory, logsDir, pipLogsDir, languageServerProxy, languageServerProxyArgs) {
    new ws_1.Server({ noServer: true }).handleUpgrade(request, sock, head, function (ws) {
        var proxyBinaryPath;
        var proxyBinaryArgs;
        if (languageServerProxy) {
            proxyBinaryPath = languageServerProxy;
            proxyBinaryArgs = languageServerProxyArgs;
        }
        // Session manages its own lifetime.
        // tslint:disable-next-line:no-unused-expression
        new Session(new sockets_1.WebSocketAdapter(ws), rootDirectory, contentDirectory, logsDir, pipLogsDir, proxyBinaryPath, proxyBinaryArgs);
    });
}
exports.WebSocketToLsp = WebSocketToLsp;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHl0aG9uX2xzcC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uL3RoaXJkX3BhcnR5L2NvbGFiL3NvdXJjZXMvcHl0aG9uX2xzcC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7O0dBY0c7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUVILCtCQUFpQztBQUNqQyw0Q0FBOEM7QUFDOUMsaUNBQW1DO0FBQ25DLHVCQUF5QjtBQUd6Qix1QkFBeUI7QUFDekIsMkJBQTZCO0FBQzdCLHlCQUEwQjtBQUUxQixvQ0FBc0M7QUFDdEMsbUNBQXFDO0FBQ3JDLDhDQUFnRDtBQUNoRCxxQ0FBb0U7QUFJcEUscUVBQXFFO0FBQ3JFLDhFQUE4RTtBQUM5RSx5QkFBeUI7QUFDekIsRUFBRTtBQUNGLGdGQUFnRjtBQUNoRixJQUFNLGtCQUFrQixHQUFHLE9BQU8sQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO0FBRWxFLElBQUksY0FBYyxHQUFHLENBQUMsQ0FBQztBQUN2QixJQUFJLFdBQVcsR0FBRyxDQUFDLENBQUM7QUFFcEIsNEJBQTRCO0FBQzVCO0lBU0UsaUJBQ3FCLE1BQWMsRUFBRSxhQUFxQixFQUN0RCxnQkFBd0IsRUFBRSxPQUFlLEVBQUUsVUFBa0IsRUFDN0QsZUFBd0IsRUFBRSxlQUFvQztRQUhsRSxpQkErSEM7UUE5SG9CLFdBQU0sR0FBTixNQUFNLENBQVE7UUFQM0IsV0FBTSxHQUFHLEtBQUssQ0FBQztRQVVyQixJQUFJLENBQUMsRUFBRSxHQUFHLGNBQWMsRUFBRSxDQUFDO1FBQzNCLEVBQUUsV0FBVyxDQUFDO1FBRWQsSUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsZUFBUSxjQUFjLFNBQU0sQ0FBQyxDQUFDO1FBQ2pFLElBQUksQ0FBQyxhQUFhLEdBQUcsT0FBTyxD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T0FBTyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsVUFBQyxFQUFFO1FBQ2pFLElBQUksZUFBaUMsQ0FBQztRQUN0QyxJQUFJLGVBQW1DLENBQUM7UUFDeEMsSUFBSSxtQkFBbUIsRUFBRSxDQUFDO1lBQ3hCLGVBQWUsR0FBRyxtQkFBbUIsQ0FBQztZQUN0QyxlQUFlLEdBQUcsdUJBQXVCLENBQUM7UUFDNUMsQ0FBQztRQUNELG9DQUFvQztRQUNwQyxnREFBZ0Q7UUFDaEQsSUFBSSxPQUFPLENBQ1AsSUFBSSwwQkFBZ0IsQ0FBQyxFQUFFLENBQUMsRUFBRSxhQUFhLEVBQUUsZ0JBQWdCLEVBQUUsT0FBTyxFQUNsRSxVQUFVLEVBQUUsZUFBZSxFQUFFLGVBQWUsQ0FBQyxDQUFDO0lBQ3BELENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQztBQWxCRCx3Q0FrQkMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IDIwMjAgR29vZ2xlIEluYy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpOyB5b3UgbWF5IG5vdFxuICogdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLiBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2ZcbiAqIHRoZSBMaWNlbnNlIGF0XG4gKlxuICogaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4gKlxuICogVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuICogZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLCBXSVRIT1VUXG4gKiBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuIFNlZSB0aGVcbiAqIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kIGxpbWl0YXRpb25zIHVuZGVyXG4gKiB0aGUgTGljZW5zZS5cbiAqL1xuXG5pbXBvcnQgKiBhcyBidW55YW4gZnJvbSAnYnVueWFuJztcbmltcG9ydCAqIGFzIGNoaWxkUHJvY2VzcyBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7cmFuZG9tQnl0ZXN9IGZyb20gJ2NyeXB0byc7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBodHRwIGZyb20gJ2h0dHAnO1xuaW1wb3J0ICogYXMgbmV0IGZyb20gJ25ldCc7XG5pbXBvcnQgKiBhcyBvcyBmcm9tICdvcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHtTZXJ2ZXJ9IGZyb20gJ3dzJztcblxuaW1wb3J0ICogYXMganNvblJwYyBmcm9tICcuL2pzb25fcnBjJztcbmltcG9ydCAqIGFzIGxvZ2dpbmcgZnJvbSAnLi9sb2dnaW5nJztcbmltcG9ydCAqIGFzIHByb3RvY29sIGZyb20gJy4vbHNwL3Byb3RvY29sX25vZGUnO1xuaW1wb3J0IHtTb2NrZXQsIFNvY2tldElPQWRhcHRlciwgV2ViU29ja2V0QWRhcHRlcn0gZnJvbSAnLi9zb2NrZXRzJztcblxuXG5cbi8vIFdlIGltcG9ydCB0aGUgYnVueWFuLXJvdGF0aW5nLWZpbGUtc3RyZWFtIHBhY2thZ2UsIHdoaWNoIGV4cG9ydHMgYVxuLy8gY29uc3RydWN0b3IgYXMgYSBzaW5nbGUgb2JqZWN0OyB3ZSB1c2UgbGludCBkaXNhYmxlcyBoZXJlIHRvIG1ha2UgdGhlIHVzYWdlXG4vLyBiZWxvdyBsb29rIHJlYXNvbmFibGUuXG4vL1xuLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOm5vLXJlcXVpcmUtaW1wb3J0cyB2YXJpYWJsZS1uYW1lIGVuZm9yY2UtbmFtZS1jYXNpbmdcbmNvbnN0IFJvdGF0aW5nRmlsZVN0cmVhbSA9IHJlcXVpcmUoJ2J1bnlhbi1yb3RhdGluZy1maWxlLXN0cmVhbScpO1xuXG5sZXQgc2Vzc2lvbkNvdW50ZXIgPSAwO1xubGV0IGFjdGl2ZUNvdW50ID0gMDtcblxuLyoqIFNvY2tldDwtPnB5cmlnaHQgTFNQLiAqL1xuY2xhc3MgU2Vzc2lvbiB7XG4gIHByaXZhdGUgcmVhZG9ubHkgaWQ6IG51bWJlcjtcbiAgcHJpdmF0ZSByZWFkb25seSBweXJpZ2h0OiBjaGlsZFByb2Nlc3MuQ2hpbGRQcm9jZXNzO1xuICBwcml2YXRlIGNsb3NlZCA9IGZhbHNlO1xuICBwcml2YXRlIHJlYWRvbmx5IGxzcExvZ2dlcjogYnVueWFuLklMb2dnZXI7XG4gIHByaXZhdGUgcmVhZG9ubHkgY29uc29sZUxvZ2dlcjogYnVueWFuLklMb2dnZXI7XG4gIHByaXZhdGUgcmVhZG9ubHkgcGlwTG9nV2F0Y2hlcj86IGZzLkZTV2F0Y2hlcjtcbiAgcHJpdmF0ZSByZWFkb25seSBjYW5jZWxsYXRpb246IEZpbGVCYXNlZENhbmNlbGxhdGlvbjtcblxuICBjb25zdHJ1Y3RvcihcbiAgICAgIHByaXZhdGUgcmVhZG9ubHkgc29ja2V0OiBTb2NrZXQsIHJvb3REaXJlY3Rvcnk6IHN0cmluZyxcbiAgICAgIGNvbnRlbnREaXJlY3Rvcnk6IHN0cmluZywgbG9nc0Rpcjogc3RyaW5nLCBwaXBMb2dzRGlyOiBzdHJpbmcsXG4gICAgICBwcm94eUJpbmFyeVBhdGg/OiBzdHJpbmcsIHByb3h5QmluYXJ5QXJncz86IHN0cmluZ1tdfHVuZGVmaW5lZCkge1xuICAgIHRoaXMuaWQgPSBzZXNzaW9uQ291bnRlcisrO1xuICAgICsrYWN0aXZlQ291bnQ7XG5cbiAgICBjb25zdCBsb2dQYXRoID0gcGF0aC5qb2luKGxvZ3NEaXIsIGAvbHNwLiR7c2Vzc2lvbkNvdW50ZXJ9LmxvZ2ApO1xuICAgIHRoaXMuY29uc29sZUxvZ2dlciA9IGxvZ2dpbmcuZ2V0TG9nZ2VyKCk7XG4gICAgdGhpcy5jb25zb2xlTG9nZ2VyLmluZm8oXG4gICAgICAgIGBMU1AgJHt0aGlzLmlkfSBuZXcgc2Vzc2lvbiwgJHthY3RpdmVDb3VudH0gbm93IGFjdGl2ZWApO1xuXG4gICAgdGhpcy5sc3BMb2dnZXIgPSBidW55YW4uY3JlYXRlTG9nZ2VyKHtcbiAgICAgIG5hbWU6ICdsc3AnLFxuICAgICAgc3RyZWFtczogW3tcbiAgICAgICAgbGV2ZWw6ICdpbmZvJyxcbiAgICAgICAgc3RyZWFtOiBuZXcgUm90YXRpbmdGaWxlU3RyZWFtKHtcbiAgICAgICAgICBwYXRoOiBsb2dQYXRoLFxuICAgICAgICAgIHJvdGF0ZUV4aXN0aW5nOiBmYWxzZSxcbiAgICAgICAgICB0aHJlc2hvbGQ6ICcybScsXG4gICAgICAgICAgdG90YWxTaXplOiAnMjBtJ1xuICAgICAgICB9KSxcbiAgICAgIH1dLFxuICAgIH0pO1xuICAgIGRlbGV0ZSB0aGlzLmxzcExvZ2dlci5maWVsZHNbJ2hvc3RuYW1lJ107XG4gICAgZGVsZXRlIHRoaXMubHNwTG9nZ2VyLmZpZWxkc1snbmFtZSddO1xuICAgIHRoaXMuY2FuY2VsbGF0aW9uID0gbmV3IEZpbGVCYXNlZENhbmNlbGxhdGlvbih0aGlzLmxzcExvZ2dlcik7XG5cbiAgICAvLyBUbyB0ZXN0IGFnYWluc3QgbG9jYWxseSBidWlsdCB2ZXJzaW9ucyBvZiBQeXJpZ2h0IHNlZSB0aGUgZG9jczpcbiAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3B5cmlnaHQvYmxvYi9tYWluL2RvY3MvYnVpbGQtZGVidWcubWRcbiAgICAvL1xuICAgIC8vIFlvdSdsbCB3YW50IHRvIGNoYW5nZSB0aGUgcGF0aCB0byBwb2ludCB0byB5b3VyIGxvY2FsIFB5cmlnaHQgY29kZSBlLmcuXG4gICAgLy8gJHtIT01FfS9weXJpZ2h0L3BhY2thZ2VzL3B5cmlnaHQvbGFuZ3NlcnZlci5pbmRleC5qc1xuICAgIC8vXG4gICAgLy8gVGhlbiBmcm9tIHdpdGhpbiB0aGUgUHlyaWdodCByb290IGZvbGRlciByZWJ1aWxkIHRoZSBzb3VyY2VzIHdpdGg6XG4gICAgLy8gbnBtIHJ1biBidWlsZDpjbGk6ZGV2XG4gICAgbGV0IHByb2Nlc3NOYW1lID0gJ25vZGUnO1xuICAgIGNvbnN0IHByb2Nlc3NBcmdzID0gW1xuICAgICAgcGF0aC5qb2luKFxuICAgICAgICAgIGNvbnRlbnREaXJlY3RvcnksICcuLicsICdkYXRhbGFiJywgJ3dlYicsICdweXJpZ2h0JyxcbiAgICAgICAgICAncHlyaWdodC1sYW5nc2VydmVyLmpzJyksXG4gICAgICAvLyBVc2luZyBzdGRpbi9zdGRvdXQgZm9yIHBhc3NpbmcgbWVzc2FnZXMuXG4gICAgICAnLS1zdGRpbycsXG4gICAgICAvLyBVc2UgZmlsZS1iYXNlZCBjYW5jZWxsYXRpb24gdG8gYWxsb3cgYmFja2dyb3VuZCBhbmFseXNpcy5cbiAgICAgIGAtLWNhbmNlbGxhdGlvblJlY2VpdmU9ZmlsZToke3RoaXMuY2FuY2VsbGF0aW9uLmZvbGRlck5hbWV9YCxcbiAgICBdO1xuXG4gICAgaWYgKHByb3h5QmluYXJ5UGF0aCkge1xuICAgICAgcHJvY2Vzc0FyZ3MudW5zaGlmdChwcm9jZXNzTmFtZSk7XG4gICAgICBwcm9jZXNzQXJncy51bnNoaWZ0KCctLScpO1xuICAgICAgaWYgKHByb3h5QmluYXJ5QXJncykge1xuICAgICAgICBwcm9jZXNzQXJncy51bnNoaWZ0KC4uLnByb3h5QmluYXJ5QXJncyk7XG4gICAgICB9XG4gICAgICBwcm9jZXNzTmFtZSA9IHByb3h5QmluYXJ5UGF0aDtcbiAgICB9XG5cbiAgICB0aGlzLnB5cmlnaHQgPSBjaGlsZFByb2Nlc3Muc3Bhd24ocHJvY2Vzc05hbWUsIHByb2Nlc3NBcmdzLCB7XG4gICAgICBzdGRpbzogWydwaXBlJ10sXG4gICAgICBjd2Q6IHJvb3REaXJlY3RvcnksXG4gICAgfSk7XG4gICAgZnMud3JpdGVGaWxlKGAvcHJvYy8ke3RoaXMucHlyaWdodC5waWR9L29vbV9zY29yZV9hZGpgLCAnMTAwMCcsIChlcnJvcikgPT4ge1xuICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgIHRoaXMuY29uc29sZUxvZ2dlci5lcnJvcihlcnJvciBhcyBFcnJvciwgYExTUCBzZXQgb29tX3Njb3JlX2FkamApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBjb25zdCBycGMgPSBuZXcganNvblJwYy5Kc29uUnBjUmVhZGVyKChtZXNzYWdlKSA9PiB7XG4gICAgICBpZiAoIXRoaXMucHJvY2Vzc0xhbmd1YWdlU2VydmVyTWVzc2FnZShtZXNzYWdlLmNvbnRlbnQpKSB7XG4gICAgICAgIHRoaXMubHNwTG9nZ2VyLmluZm8oJ2M8LS1zJyArIG1lc3NhZ2UuY29udGVudCk7XG4gICAgICAgIHRoaXMuc29ja2V0LnNlbmRTdHJpbmcobWVzc2FnZS5jb250ZW50KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMubHNwTG9nZ2VyLmluZm8oJyA8LS1zJyArIG1lc3NhZ2UuY29udGVudCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBjb25zdCBlbmNvZGVyID0gbmV3IFRleHRFbmNvZGVyKCk7XG4gICAgdGhpcy5weXJpZ2h0LnN0ZG91dCEub24oJ2RhdGEnLCAoZGF0YTogc3RyaW5nKSA9PiB7XG4gICAgICBpZiAodGhpcy5jbG9zZWQpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgdHJ5IHtcbiAgICAgICAgcnBjLmFwcGVuZChlbmNvZGVyLmVuY29kZShkYXRhKSk7XG4gICAgICB9IGNhdGNoIChlcnJvcjogdW5rbm93bikge1xuICAgICAgICB0aGlzLmNvbnNvbGVMb2dnZXIuZXJyb3IoXG4gICAgICAgICAgICBgTFNQICR7dGhpcy5pZH0gZXJyb3IgaGFuZGxpbmcgcHlyaWdodCBkYXRhOiAke2Vycm9yfWApO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHRoaXMucHlyaWdodC5zdGRlcnIhLm9uKCdkYXRhJywgKGRhdGE6IEJ1ZmZlcikgPT4ge1xuICAgICAgY29uc3Qgb3V0ID0gZGF0YS50b1N0cmluZygpLnJlcGxhY2UoL1xcbiQvLCAnJyk7XG4gICAgICB0aGlzLmNvbnNvbGVMb2dnZXIuZXJyb3IoYExTUCAke3RoaXMuaWR9IHB5cmlnaHQgZXJyb3IgY29uc29sZTogJHtvdXR9YCk7XG4gICAgfSk7XG5cbiAgICB0aGlzLnB5cmlnaHQub24oJ2Vycm9yJywgKGRhdGE6IHN0cmluZykgPT4ge1xuICAgICAgdGhpcy5jb25zb2xlTG9nZ2VyLmVycm9yKGBMU1AgJHt0aGlzLmlkfSBweXJpZ2h0IGVycm9yOiAke2RhdGF9YCk7XG4gICAgICB0aGlzLmNsb3NlKCk7XG4gICAgfSk7XG5cbiAgICB0aGlzLnNvY2tldC5vbkNsb3NlKChyZWFzb24pID0+IHtcbiAgICAgIHRoaXMuY29uc29sZUxvZ2dlci5kZWJ1ZyhcbiAgICAgICAgICBgTFNQICR7dGhpcy5pZH0gU29ja2V0IGRpc2Nvbm5lY3RlZCBmb3IgcmVhc29uOiBcIiVzXCJgLCByZWFzb24pO1xuXG4gICAgICAvLyBIYW5kbGUgY2xpZW50IGRpc2Nvbm5lY3RzIHRvIGNsb3NlIHNvY2tldHMsIHNvIGFzIHRvIGZyZWUgdXAgcmVzb3VyY2VzLlxuICAgICAgdGhpcy5jbG9zZSgpO1xuICAgIH0pO1xuXG4gICAgdGhpcy5zb2NrZXQub25TdHJpbmdNZXNzYWdlKGRhdGEgPT4ge1xuICAgICAgaWYgKHRoaXMuY2xvc2VkKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHRoaXMuaGFuZGxlRGF0YUZyb21DbGllbnQoZGF0YSk7XG4gICAgfSk7XG5cbiAgICB0cnkge1xuICAgICAgdGhpcy5waXBMb2dXYXRjaGVyID0gZnMud2F0Y2goXG4gICAgICAgICAgcGlwTG9nc0Rpciwge1xuICAgICAgICAgICAgcmVjdXJzaXZlOiBmYWxzZSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIChldmVudDogc3RyaW5nLCBmaWxlbmFtZTogdW5rbm93bikgPT4ge1xuICAgICAgICAgICAgaWYgKGZpbGVuYW1lID09PSAncGlwLmxvZycpIHtcbiAgICAgICAgICAgICAgdGhpcy5waXBMb2dDaGFuZ2VkKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3I6IHVua25vd24pIHtcbiAgICAgIHRoaXMuY29uc29sZUxvZ2dlci5lcnJvcihcbiAgICAgICAgICBgTFNQICR7dGhpcy5pZH0gRXJyb3Igc3RhcnRpbmcgcGlwLmxvZyB3YXRjaGVyOiAlc2AsIGVycm9yIGFzIHt9KTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGhhbmRsZURhdGFGcm9tQ2xpZW50KGRhdGE6IHN0cmluZykge1xuICAgIGlmICh0aGlzLmNsb3NlZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgdGhpcy5sc3BMb2dnZXIuaW5mbygnYy0tPnMnICsgZGF0YSk7XG4gICAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6bm8tYW55XG4gICAgICBjb25zdCBtZXNzYWdlID0gSlNPTi5wYXJzZShkYXRhKSBhcyBhbnk7XG4gICAgICBpZiAobWVzc2FnZS5tZXRob2QgPT09ICdpbml0aWFsaXplJykge1xuICAgICAgICAvLyBQYXRjaCB0aGUgcHJvY2Vzc0lkIHRvIGJlIHRoaXMgb25lIHNpbmNlIHRoZSBjbGllbnQgZG9lcyBub3QgZG9lc1xuICAgICAgICAvLyBub3Qga25vdyBhYm91dCB0aGlzIHByb2Nlc3MgSUQuXG4gICAgICAgIG1lc3NhZ2UucGFyYW1zLnByb2Nlc3NJZCA9IHByb2Nlc3MucGlkO1xuICAgICAgfVxuICAgICAgbGV0IGpzb24gPSBKU09OLnN0cmluZ2lmeShtZXNzYWdlKTtcbiAgICAgIGpzb24gPSBqc29uLnJlcGxhY2UoL1tcXHUwMDdGLVxcdUZGRkZdL2csIChjaHIpID0+IHtcbiAgICAgICAgLy8gUmVwbGFjZSBub24tQVNDSUkgY2hhcmFjdGVycyB3aXRoIHVuaWNvZGUgZW5jb2RpbmdzIHRvIGF2b2lkIGlzc3Vlc1xuICAgICAgICAvLyBzZW5kaW5nIHVuaWNvZGUgY2hhcmFjdGVycyB0aHJvdWdoIHN0ZGluLlxuICAgICAgICAvLyBXZSBkb24ndCBuZWVkIHRvIGhhbmRsZSBzdXJyb2dhdGUgcGFpcnMgYXMgdGhlc2Ugd29uJ3QgYmUgYSBzaW5nbGVcbiAgICAgICAgLy8gY2hhcmFjdGVyIGluIHRoZSBKU09OLlxuICAgICAgICByZXR1cm4gJ1xcXFx1JyArICgnMDAwMCcgKyBjaHIuY2hhckNvZGVBdCgwKS50b1N0cmluZygxNikpLnN1YnN0cigtNCk7XG4gICAgICB9KTtcbiAgICAgIHRoaXMucHlyaWdodC5zdGRpbiEud3JpdGUoanNvblJwYy5lbmNvZGVKc29uUnBjKGpzb24pKTtcbiAgICB9IGNhdGNoIChlcnJvcjogdW5rbm93bikge1xuICAgICAgLy8gRXJyb3JzIHByb3BhZ2F0ZWQgZnJvbSBoZXJlIHdpbGwgZGlzY29ubmVjdCB0aGUga2VybmVsLlxuICAgICAgdGhpcy5jb25zb2xlTG9nZ2VyLmVycm9yKFxuICAgICAgICAgIGBMU1AgJHt0aGlzLmlkfSBTb2NrZXQgZXJyb3Igd3JpdGluZyAlc2AsIFN0cmluZyhlcnJvcikpO1xuICAgICAgdGhpcy5jbG9zZSgpO1xuICAgIH1cbiAgfVxuXG4gIC8qKiBAcmV0dXJuIFRydWUgaWYgdGhlIG1lc3NhZ2UgaXMgY29uc3VtZWQgYW5kIHNob3VsZCBub3QgYmUgZm9yd2FyZGVkLiAqL1xuICBwcml2YXRlIHByb2Nlc3NMYW5ndWFnZVNlcnZlck1lc3NhZ2UoZGF0YTogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBKU09OLnBhcnNlKGRhdGEpIGFzIHByb3RvY29sLk1lc3NhZ2U7XG4gICAgICBpZiAoJ2lkJyBpbiBtZXNzYWdlKSB7XG4gICAgICAgIGlmICgnbWV0aG9kJyBpbiBtZXNzYWdlICYmICdwYXJhbXMnIGluIG1lc3NhZ2UpIHtcbiAgICAgICAgICB0aGlzLmhhbmRsZVJlcXVlc3QobWVzc2FnZSBhcyBwcm90b2NvbC5SZXF1ZXN0TWVzc2FnZTx1bmtub3duPik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5oYW5kbGVSZXNwb25zZShtZXNzYWdlIGFzIHByb3RvY29sLlJlc3BvbnNlTWVzc2FnZSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB0aGlzLmhhbmRsZU5vdGlmaWNhdGlvbihcbiAgICAgICAgICAgIG1lc3NhZ2UgYXMgcHJvdG9jb2wuTm90aWZpY2F0aW9uTWVzc2FnZTx1bmtub3duPik7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3I6IHVua25vd24pIHtcbiAgICAgIHRoaXMuY29uc29sZUxvZ2dlci5lcnJvcihcbiAgICAgICAgICBgTFNQICR7dGhpcy5pZH0gRXJyb3IgcHJvY2Vzc2luZyBtZXNzYWdlOiAlcyBmcm9tIFwiJXNcImAsIGVycm9yIGFzIHt9LFxuICAgICAgICAgIGRhdGEpO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICAvKiogQHJldHVybiBUcnVlIGlmIHRoZSBtZXNzYWdlIGlzIGNvbnN1bWVkIGFuZCBzaG91bGQgbm90IGJlIGZvcndhcmRlZC4gKi9cbiAgcHJpdmF0ZSBoYW5kbGVOb3RpZmljYXRpb24oXG4gICAgICBub3RpZmljYXRpb246IHByb3RvY29sLk5vdGlmaWNhdGlvbk1lc3NhZ2U8dW5rbm93bj4pOiBib29sZWFuIHtcbiAgICBpZiAobm90aWZpY2F0aW9uLm1ldGhvZCA9PT0gcHJvdG9jb2wuTWV0aG9kLkNhbmNlbFJlcXVlc3QpIHtcbiAgICAgIGNvbnN0IGNhbmNlbGxhdGlvbiA9XG4gICAgICAgICAgbm90aWZpY2F0aW9uIGFzIHByb3RvY29sLk5vdGlmaWNhdGlvbk1lc3NhZ2U8cHJvdG9jb2wuQ2FuY2VsUGFyYW1zPjtcbiAgICAgIHRoaXMuY2FuY2VsbGF0aW9uLmNhbmNlbChjYW5jZWxsYXRpb24ucGFyYW1zLmlkKTtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgICBub3RpZmljYXRpb24ubWV0aG9kID09PSAncHlyaWdodC9iZWdpblByb2dyZXNzJyB8fFxuICAgICAgICBub3RpZmljYXRpb24ubWV0aG9kID09PSAncHlyaWdodC9yZXBvcnRQcm9ncmVzcycgfHxcbiAgICAgICAgbm90aWZpY2F0aW9uLm1ldGhvZCA9PT0gJ3B5cmlnaHQvZW5kUHJvZ3Jlc3MnKSB7XG4gICAgICAvLyBDb2xhYiBkb2Vzbid0IHVzZSB0aGVzZSBwcm9ncmVzcyBtZXNzYWdlcyByaWdodCBub3cgYW5kIHRoZXkganVzdFxuICAgICAgLy8gY29uZ2VzdCBzb2NrZXQuaW8gZHVyaW5nIGNvbXBsZXRpb24gZmxvd3MuXG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaGFuZGxlUmVxdWVzdChyZXF1ZXN0OiBwcm90b2NvbC5SZXF1ZXN0TWVzc2FnZTx1bmtub3duPikge1xuICAgIC8vIE5vdGhpbmcgdG8gZG8gaGVyZSB5ZXQuXG4gIH1cblxuICBoYW5kbGVSZXNwb25zZShyZXNwb25zZTogcHJvdG9jb2wuUmVzcG9uc2VNZXNzYWdlKSB7XG4gICAgaWYgKHJlc3BvbnNlLmVycm9yICYmXG4gICAgICAgIHJlc3BvbnNlLmVycm9yLmNvZGUgPT09IHByb3RvY29sLkVycm9yQ29kZS5SZXF1ZXN0Q2FuY2VsbGVkICYmXG4gICAgICAgIHJlc3BvbnNlLmlkKSB7XG4gICAgICB0aGlzLmNhbmNlbGxhdGlvbi5jbGVhbnVwKHJlc3BvbnNlLmlkKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHBpcExvZ0NoYW5nZWQoKSB7XG4gICAgdGhpcy5zZW5kTm90aWZpY2F0aW9uVG9DbGllbnQocHJvdG9jb2wuTWV0aG9kLkNvbGFiUGlwTG9nQ2hhbmdlZCwge30pO1xuICB9XG5cbiAgcHJpdmF0ZSBzZW5kTm90aWZpY2F0aW9uVG9DbGllbnQ8VD4obWV0aG9kOiBwcm90b2NvbC5NZXRob2QsIHBhcmFtczogVCkge1xuICAgIGlmICh0aGlzLmNsb3NlZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBqc29uOiBwcm90b2NvbC5Ob3RpZmljYXRpb25NZXNzYWdlPFQ+ID0ge1xuICAgICAgbWV0aG9kLFxuICAgICAgcGFyYW1zLFxuICAgICAganNvbnJwYzogJzIuMCcsXG4gICAgfTtcbiAgICBjb25zdCBkYXRhID0gSlNPTi5zdHJpbmdpZnkoanNvbik7XG4gICAgdGhpcy5sc3BMb2dnZXIuaW5mbygnYzwtLXMnICsgZGF0YSk7XG4gICAgdGhpcy5zb2NrZXQuc2VuZFN0cmluZyhkYXRhKTtcbiAgfVxuXG4gIHByaXZhdGUgY2xvc2UoKSB7XG4gICAgaWYgKHRoaXMuY2xvc2VkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMuY2xvc2VkID0gdHJ1ZTtcbiAgICB0aGlzLnNvY2tldC5jbG9zZSh0cnVlKTtcbiAgICAvLyBGb3JjZS1raWxsIHB5cmlnaHQgcHJvY2VzcyB0byBlbnN1cmUgZnVsbCBzaHV0ZG93bi5cbiAgICAvLyBUaGUgcHJvY2VzcyBzaG91bGQgZWZmZWN0aXZlbHkgYmUgcmVhZC1vbmx5IHdoZXJlIGl0IGRvZXMgbm90IGdlbmVyYXRlXG4gICAgLy8gYW55IGRhdGEgb3RoZXIgdGhhbiB3aGF0IGlzIHNlbnQgYmFjayB0byB0aGlzIHByb2Nlc3MuXG4gICAgdGhpcy5weXJpZ2h0LmtpbGwoOSk7XG4gICAgaWYgKHRoaXMucGlwTG9nV2F0Y2hlcikge1xuICAgICAgdGhpcy5waXBMb2dXYXRjaGVyLmNsb3NlKCk7XG4gICAgfVxuICAgIHRoaXMuY2FuY2VsbGF0aW9uLmRpc3Bvc2UoKTtcblxuICAgIC0tYWN0aXZlQ291bnQ7XG4gICAgdGhpcy5jb25zb2xlTG9nZ2VyLmluZm8oXG4gICAgICAgIGBMU1AgJHt0aGlzLmlkfSBjbG9zZWQgc2Vzc2lvbiwgJHthY3RpdmVDb3VudH0gcmVtYWluaW5nIGFjdGl2ZWApO1xuICB9XG59XG5cbi8qKiBTb2NrZXRJTyB0byBQeVJpZ2h0IGFkYXB0ZXIuICovXG5leHBvcnQgY2xhc3MgU29ja2V0SU9Ub0xzcCB7XG4gIGNvbnN0cnVjdG9yKFxuICAgICAgc2VydmVyOiBTb2NrZXRJTy5TZXJ2ZXIsIHJvb3REaXJlY3Rvcnk6IHN0cmluZywgY29udGVudERpcmVjdG9yeTogc3RyaW5nLFxuICAgICAgbG9nc0Rpcjogc3RyaW5nLCBwaXBMb2dzRGlyOiBzdHJpbmcsIGxhbmd1YWdlU2VydmVyUHJveHk/OiBzdHJpbmcsXG4gICAgICBsYW5ndWFnZVNlcnZlclByb3h5QXJncz86IHN0cmluZ1tdKSB7XG4gICAgLy8gQ2FzdCB0byBzdHJpbmcgaXMgYmVjYXVzZSB0aGUgdHlwaW5ncyBhcmUgbWlzc2luZyB0aGUgcmVnZXhwIG92ZXJyaWRlLlxuICAgIC8vIERvY3VtZW50ZWQgaW4gaHR0cHM6Ly9zb2NrZXQuaW8vZG9jcy92Mi9uYW1lc3BhY2VzLy5cbiAgICBzZXJ2ZXIub2YobmV3IFJlZ0V4cCgnL3B5dGhvbi1sc3AvLionKSBhcyB1bmtub3duIGFzIHN0cmluZylcbiAgICAgICAgLm9uKCdjb25uZWN0aW9uJywgKHNvY2tldDogU29ja2V0SU8uU29ja2V0KSA9PiB7XG4gICAgICAgICAgbGV0IHByb3h5QmluYXJ5UGF0aDogc3RyaW5nfHVuZGVmaW5lZDtcbiAgICAgICAgICBsZXQgcHJveHlCaW5hcnlBcmdzOiBzdHJpbmdbXXx1bmRlZmluZWQ7XG4gICAgICAgICAgaWYgKGxhbmd1YWdlU2VydmVyUHJveHkpIHtcbiAgICAgICAgICAgIHByb3h5QmluYXJ5UGF0aCA9IGxhbmd1YWdlU2VydmVyUHJveHk7XG4gICAgICAgICAgICBwcm94eUJpbmFyeUFyZ3MgPSBsYW5ndWFnZVNlcnZlclByb3h5QXJncztcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gU2Vzc2lvbiBtYW5hZ2VzIGl0cyBvd24gbGlmZXRpbWUuXG4gICAgICAgICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOm5vLXVudXNlZC1leHByZXNzaW9uXG4gICAgICAgICAgbmV3IFNlc3Npb24oXG4gICAgICAgICAgICAgIG5ldyBTb2NrZXRJT0FkYXB0ZXIoc29ja2V0KSwgcm9vdERpcmVjdG9yeSwgY29udGVudERpcmVjdG9yeSxcbiAgICAgICAgICAgICAgbG9nc0RpciwgcGlwTG9nc0RpciwgcHJveHlCaW5hcnlQYXRoLCBwcm94eUJpbmFyeUFyZ3MpO1xuICAgICAgICB9KTtcbiAgfVxufVxuXG5jbGFzcyBGaWxlQmFzZWRDYW5jZWxsYXRpb24ge1xuICBwcml2YXRlIHJlYWRvbmx5IGZvbGRlclBhdGg6IHN0cmluZztcbiAgcmVhZG9ubHkgZm9sZGVyTmFtZTogc3RyaW5nO1xuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGxvZ2dlcjogYnVueWFuLklMb2dnZXIpIHtcbiAgICB0aGlzLmZvbGRlck5hbWUgPSByYW5kb21CeXRlcygyMSkudG9TdHJpbmcoJ2hleCcpO1xuICAgIC8vIFRoaXMgbXVzdCBtYXRjaCB0aGUgbmFtaW5nIHVzZWQgaW46XG4gICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC9weXJpZ2h0L2Jsb2IvN2JiMDU5ZWNiYWI1YzBjNDQ2ZDRkY2Y1Mzc2ZmM1Y2U4YmQ4Y2QyNi9wYWNrYWdlcy9weXJpZ2h0LWludGVybmFsL3NyYy9jb21tb24vY2FuY2VsbGF0aW9uVXRpbHMudHMjTDE4OVxuICAgIHRoaXMuZm9sZGVyUGF0aCA9IHBhdGguam9pbihcbiAgICAgICAgb3MudG1wZGlyKCksICdweXRob24tbGFuZ3VhZ2VzZXJ2ZXItY2FuY2VsbGF0aW9uJywgdGhpcy5mb2xkZXJOYW1lKTtcbiAgICBmcy5ta2RpclN5bmModGhpcy5mb2xkZXJQYXRoLCB7cmVjdXJzaXZlOiB0cnVlfSk7XG4gIH1cblxuICBjYW5jZWwoaWQ6IHN0cmluZ3xudW1iZXIpIHtcbiAgICBmcy5wcm9taXNlcy53cml0ZUZpbGUodGhpcy5nZXRDYW5jZWxsYXRpb25QYXRoKGlkKSwgJycsIHtmbGFnOiAndyd9KVxuICAgICAgICAuY2F0Y2goKGVycm9yOiB1bmtub3duKSA9PiB7XG4gICAgICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoZXJyb3IgYXMgRXJyb3IsIGBMU1AgRmlsZUJhc2VkQ2FuY2VsbGF0aW9uLmNhbmNlbGApO1xuICAgICAgICB9KTtcbiAgfVxuXG4gIGNsZWFudXAoaWQ6IHN0cmluZ3xudW1iZXIpIHtcbiAgICBmcy5wcm9taXNlcy51bmxpbmsodGhpcy5nZXRDYW5jZWxsYXRpb25QYXRoKGlkKSkuY2F0Y2goKGVycm9yOiB1bmtub3duKSA9PiB7XG4gICAgICB0aGlzLmxvZ2dlci5lcnJvcihlcnJvciBhcyBFcnJvciwgYExTUCBGaWxlQmFzZWRDYW5jZWxsYXRpb24uY2xlYW51cGApO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZGlzcG9zZSgpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgZmlsZXMgPSBhd2FpdCBmcy5wcm9taXNlcy5yZWFkZGlyKHRoaXMuZm9sZGVyUGF0aCk7XG4gICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBhd2FpdCBmcy5wcm9taXNlcy51bmxpbmsocGF0aC5qb2luKHRoaXMuZm9sZGVyUGF0aCwgZmlsZSkpO1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogdW5rbm93bikge1xuICAgICAgICAgIHRoaXMubG9nZ2VyLmVycm9yKFxuICAgICAgICAgICAgICBlcnJvciBhcyBFcnJvciwgYExTUCBGaWxlQmFzZWRDYW5jZWxsYXRpb24uZGlzcG9zZWApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBhd2FpdCBmcy5wcm9taXNlcy5ybWRpcih0aGlzLmZvbGRlclBhdGgpO1xuICAgIH0gY2F0Y2ggKGVycm9yOiB1bmtub3duKSB7XG4gICAgICB0aGlzLmxvZ2dlci5lcnJvcihlcnJvciBhcyBFcnJvciwgYExTUCBGaWxlQmFzZWRDYW5jZWxsYXRpb24uZGlzcG9zZWApO1xuICAgIH1cbiAgfVxuXG4gIGdldENhbmNlbGxhdGlvblBhdGgoaWQ6IHN0cmluZ3xudW1iZXIpOiBzdHJpbmcge1xuICAgIC8vIFRoaXMgbXVzdCBtYXRjaCB0aGUgbmFtaW5nIHVzZWQgaW46XG4gICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC9weXJpZ2h0L2Jsb2IvN2JiMDU5ZWNiYWI1YzBjNDQ2ZDRkY2Y1Mzc2ZmM1Y2U4YmQ4Y2QyNi9wYWNrYWdlcy9weXJpZ2h0LWludGVybmFsL3NyYy9jb21tb24vY2FuY2VsbGF0aW9uVXRpbHMudHMjTDE5M1xuICAgIHJldHVybiBwYXRoLmpvaW4odGhpcy5mb2xkZXJQYXRoLCBgY2FuY2VsbGF0aW9uLSR7aWR9LnRtcGApO1xuICB9XG59XG5cblxuLyoqIFdlYnNvY2tldCB0byBQeVJpZ2h0IGFkYXB0ZXIuICovXG5leHBvcnQgZnVuY3Rpb24gV2ViU29ja2V0VG9Mc3AoXG4gICAgcmVxdWVzdDogaHR0cC5JbmNvbWluZ01lc3NhZ2UsIHNvY2s6IG5ldC5Tb2NrZXQsIGhlYWQ6IEJ1ZmZlcixcbiAgICByb290RGlyZWN0b3J5OiBzdHJpbmcsIGNvbnRlbnREaXJlY3Rvcnk6IHN0cmluZywgbG9nc0Rpcjogc3RyaW5nLFxuICAgIHBpcExvZ3NEaXI6IHN0cmluZywgbGFuZ3VhZ2VTZXJ2ZXJQcm94eT86IHN0cmluZyxcbiAgICBsYW5ndWFnZVNlcnZlclByb3h5QXJncz86IHN0cmluZ1tdKSB7XG4gIG5ldyBTZXJ2ZXIoe25vU2VydmVyOiB0cnVlfSkuaGFuZGxlVXBncmFkZShyZXF1ZXN0LCBzb2NrLCBoZWFkLCAod3MpID0+IHtcbiAgICBsZXQgcHJveHlCaW5hcnlQYXRoOiBzdHJpbmd8dW5kZWZpbmVkO1xuICAgIGxldCBwcm94eUJpbmFyeUFyZ3M6IHN0cmluZ1tdfHVuZGVmaW5lZDtcbiAgICBpZiAobGFuZ3VhZ2VTZXJ2ZXJQcm94eSkge1xuICAgICAgcHJveHlCaW5hcnlQYXRoID0gbGFuZ3VhZ2VTZXJ2ZXJQcm94eTtcbiAgICAgIHByb3h5QmluYXJ5QXJncyA9IGxhbmd1YWdlU2VydmVyUHJveHlBcmdzO1xuICAgIH1cbiAgICAvLyBTZXNzaW9uIG1hbmFnZXMgaXRzIG93biBsaWZldGltZS5cbiAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6bm8tdW51c2VkLWV4cHJlc3Npb25cbiAgICBuZXcgU2Vzc2lvbihcbiAgICAgICAgbmV3IFdlYlNvY2tldEFkYXB0ZXIod3MpLCByb290RGlyZWN0b3J5LCBjb250ZW50RGlyZWN0b3J5LCBsb2dzRGlyLFxuICAgICAgICBwaXBMb2dzRGlyLCBwcm94eUJpbmFyeVBhdGgsIHByb3h5QmluYXJ5QXJncyk7XG4gIH0pO1xufVxuIl19
