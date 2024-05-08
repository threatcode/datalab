"use strict";

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
exports.handleRequest = exports.handleSocket = exports.close = exports.init = void 0;
var childProcess = require("child_process");
var httpProxy = require("http-proxy");
var path = require("path");
var logging = require("./logging");
/**
 * Singleton tracking the jupyter server instance we manage.
 */
var jupyterServer = null;
/**
 * The maximum number of times we'll restart jupyter; we set a limit to avoid
 * users being stuck with a slow-crash-looping server.
 */
var remainingJupyterServerRestarts = 20;
/**
 * The application settings instance.
 */
var appSettings;
/*
 * This list of levels should match the ones used by Python:
 *   https://docs.python.org/3/library/logging.html#logging-levels
 */
var LogLevels;
(function (LogLevels) {
    LogLevels["CRITICAL"] = "CRITICAL";
    LogLevels["ERROR"] = "ERROR";
    LogLevels["WARNING"] = "WARNING";
    LogLevels["INFO"] = "INFO";
    LogLevels["DEBUG"] = "DEBUG";
    LogLevels["NOTSET"] = "NOTSET";
})(LogLevels || (LogLevels = {}));
function pipeOutput(stream) {
    stream.setEncoding('utf8');
    // The format we parse here corresponds to the log format we set in our
    // jupyter configuration.
    var logger = logging.getJupyterLogger();
    stream.on('data', function (data) {
        var e_1, _a;
        try {
            for (var _b = __values(data.split('\n')), _c = _b.next(); !_c.done; _c = _b.next()) {
                var line = _c.value;
                if (line.trim().length === 0) {
                    continue;
                }
                var parts = line.split('|', 3);
                if (parts.length !== 3) {
                    // Non-logging messages (eg tracebacks) get logged as warnings.
                    logger.warn(line);
                    continue;
                }
                var level = parts[1];
                var message = parts[2];
                // We need to map Python's log levels to those used by bunyan.
                if (level === LogLevels.CRITICAL || level === LogLevels.ERROR) {
                    logger.error(message);
                }
                else if (level === LogLevels.WARNING) {
                    logger.warn(message);
                }
                else if (level === LogLevels.INFO) {
                    logger.info(message);
                }
                else {
                    // We map DEBUG, NOTSET, and any unknown log levels to debug.
                    logger.debug(message);
                }
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
            }
            finally { if (e_1) throw e_1.error; }
        }
    });
}
function createJupyterServer() {
    var e_2, _a;
    if (!remainingJupyterServerRestarts) {
        logging.getLogger().error('No jupyter restart attempts remaining.');
        return;
    }
    remainingJupyterServerRestarts -= 1;
    var port = appSettings.nextJupyterPort;
    logging.getLogger().info('Launching Jupyter server at %d', port);
    var jupyterArgs = appSettings.jupyterArgs || [];
    function exitHandler(code, signal) {
        if (jupyterServer) {
            logging.getLogger().error('Jupyter process %d exited due to signal: %s', jupyterServer.childProcess.pid, signal);
        }
        else {
            logging.getLogger().error('Jupyter process exit before server creation finished due to signal: %s', signal);
        }
        // We want to restart jupyter whenever it terminates.
        createJupyterServer();
    }
    var contentDir = path.join(appSettings.datalabRoot, appSettings.contentDir);
    var processArgs = ['notebook'].concat(jupyterArgs || []).concat([
        "--port=".concat(port),
        "--FileContentsManager.root_dir=".concat(appSettings.datalabRoot, "/"),
        // TODO(b/136659627): Delete this line.
        "--MappingKernelManager.root_dir=".concat(contentDir),
    ]);
    var jupyterServerAddr = 'localhost';
    try {
        for (var jupyterArgs_1 = __values(jupyterArgs), jupyterArgs_1_1 = jupyterArgs_1.next(); !jupyterArgs_1_1.done; jupyterArgs_1_1 = jupyterArgs_1.next()) {
            var flag = jupyterArgs_1_1.value;
            // Extracts a string like '1.2.3.4' from the string '--ip=1.2.3.4'
            var match = flag.match(/--ip=([^ ]+)/);
            if (match) {
                jupyterServerAddr = match[1];
                break;
            }
        }
    }
    catch (e_2_1) { e_2 = { error: e_2_1 }; }
    finally {
        try {
            if (jupyterArgs_1_1 && !jupyterArgs_1_1.done && (_a = jupyterArgs_1.return)) _a.call(jupyterArgs_1);
        }
        finally { if (e_2) throw e_2.error; }
    }
    logging.getLogger().info('Using jupyter server address %s', jupyterServerAddr);
    var processOptions = {
        detached: false,
        env: process.env,
    };
    var serverProcess = childProcess.spawn('jupyter', processArgs, processOptions);
    serverProcess.on('exit', exitHandler);
    logging.getLogger().info('Jupyter process started with pid %d and args %j', serverProcess.pid, processArgs);
    // Capture the output, so it can be piped for logging.
    pipeOutput(serverProcess.stdout);
    pipeOutput(serverProcess.stderr);
    // Create the proxy.
    var proxyTargetHost = appSettings.kernelManagerProxyHost || jupyterServerAddr;
    var proxyTargetPort = appSettings.kernelManagerProxyPort || port;
    var proxy = httpProxy.createProxyServer({ target: "http://".concat(proxyTargetHost, ":").concat(proxyTargetPort) });
    proxy.on('error', errorHandler);
    jupyterServer = { port: port, proxy: proxy, childProcess: serverProcess };
}
/**
 * Initializes the Jupyter server manager.
 */
function init(settings) {
    appSettings = settings;
    createJupyterServer();
}
exports.init = init;
/**
 * Closes the Jupyter server manager.
 */
function close() {
    if (!jupyterServer) {
        return;
    }
    var pid = jupyterServer.childProcess.pid;
    logging.getLogger().info("jupyter close: PID: ".concat(pid));
    jupyterServer.childProcess.kill('SIGHUP');
}
exports.close = close;
/** Proxy this socket request to jupyter. */
function handleSocket(request, socket, head) {
    if (!jupyterServer) {
        logging.getLogger().error('Jupyter server is not running.');
        return;
    }
    jupyterServer.proxy.ws(request, socket, head);
}
exports.handleSocket = handleSocket;
/** Proxy this HTTP request to jupyter. */
function handleRequest(request, response) {
    if (!jupyterServer) {
        response.statusCode = 500;
        response.end();
        return;
    }
    jupyterServer.proxy.web(request, response, null);
}
exports.handleRequest = handleRequest;
function errorHandler(error, request, response) {
    logging.getLogger().error(error, 'Jupyter server returned error.');
    response.writeHead(500, 'Internal Server Error');
    response.end();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoianVweXRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uL3RoaXJkX3BhcnR5L2NvbGFiL3NvdXJjZXMvanVweXRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7O0dBY0c7Ozs7Ozs7Ozs7Ozs7O0FBRUgsNENBQThDO0FBRTlDLHNDQUF3QztBQUV4QywyQkFBNkI7QUFHN0IsbUNBQXFDO0FBUXJDOztHQUVHO0FBQ0gsSUFBSSxhQUFhLEdBQXVCLElBQUksQ0FBQztBQUU3Qzs7O0dBR0c7QUFDSCxJQUFJLDhCQUE4QixHQUFXLEVBQUUsQ0FBQztBQUVoRDs7R0FFRztBQUNILElBQUksV0FBd0IsQ0FBQztBQUU3Qjs7O0dBR0c7QUFDSCxJQUFLLFNBT0o7QUFQRCxXQUFLLFNBQVM7SUFDWixrQ0FBcUIsQ0FBQTtJQUNyQiw0QkFBZSxDQUFBO0lBQ2YsZ0NBQW1CLENBQUE7SUFDbkIsMEJBQWEsQ0FBQTtJQUNiLDRCQUFlLENBQUE7SUFDZiw4QkFBaUIsQ0FBQTtBQUNuQixDQUFDLEVBUEksU0FBUyxLQUFULFNBQVMsUUFPYjtBQUVELFNBQVMsVUFBVSxDQUFDLE1BQTZCO0lBQy9DLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUM7SUFFM0IsdUVBQXVFO0lBQ3ZFLHlCQUF5QjtJQUN6QixJQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztJQUMxQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxVQUFDLElBQVk7OztZQUM3QixLQUFtQixJQUFBLEtBQUEsU0FBQSxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFBLGdCQUFBLDRCQUFFLENBQUM7Z0JBQWpDLElBQU0sSUFBSSxXQUFBO2dCQUNiLElBQUksSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztvQkFDN0IsU0FBUztnQkFDWCxD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QyxLQUFLLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDbkQsQ0FBQztBQVRELHNDQVNDO0FBRUQsU0FBUyxZQUFZLENBQ2pCLEtBQVksRUFBRSxPQUE2QixFQUMzQyxRQUE2QjtJQUMvQixPQUFPLENBQUMsU0FBUyxFQUFFLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxnQ0FBZ0MsQ0FBQyxDQUFDO0lBRW5FLFFBQVEsQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFLHVCQUF1QixDQUFDLENBQUM7SUFDakQsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBQ2pCLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IDIwMTUgR29vZ2xlIEluYy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpOyB5b3UgbWF5IG5vdFxuICogdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLiBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2ZcbiAqIHRoZSBMaWNlbnNlIGF0XG4gKlxuICogaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4gKlxuICogVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuICogZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLCBXSVRIT1VUXG4gKiBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuIFNlZSB0aGVcbiAqIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kIGxpbWl0YXRpb25zIHVuZGVyXG4gKiB0aGUgTGljZW5zZS5cbiAqL1xuXG5pbXBvcnQgKiBhcyBjaGlsZFByb2Nlc3MgZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgKiBhcyBodHRwIGZyb20gJ2h0dHAnO1xuaW1wb3J0ICogYXMgaHR0cFByb3h5IGZyb20gJ2h0dHAtcHJveHknO1xuaW1wb3J0ICogYXMgbmV0IGZyb20gJ25ldCc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuXG5pbXBvcnQge0FwcFNldHRpbmdzfSBmcm9tICcuL2FwcFNldHRpbmdzJztcbmltcG9ydCAqIGFzIGxvZ2dpbmcgZnJvbSAnLi9sb2dnaW5nJztcblxuaW50ZXJmYWNlIEp1cHl0ZXJTZXJ2ZXIge1xuICBwb3J0OiBudW1iZXI7XG4gIGNoaWxkUHJvY2VzczogY2hpbGRQcm9jZXNzLkNoaWxkUHJvY2VzcztcbiAgcHJveHk6IGh0dHBQcm94eS5Qcm94eVNlcnZlcjtcbn1cblxuLyoqXG4gKiBTaW5nbGV0b24gdHJhY2tpbmcgdGhlIGp1cHl0ZXIgc2VydmVyIGluc3RhbmNlIHdlIG1hbmFnZS5cbiAqL1xubGV0IGp1cHl0ZXJTZXJ2ZXI6IEp1cHl0ZXJTZXJ2ZXJ8bnVsbCA9IG51bGw7XG5cbi8qKlxuICogVGhlIG1heGltdW0gbnVtYmVyIG9mIHRpbWVzIHdlJ2xsIHJlc3RhcnQganVweXRlcjsgd2Ugc2V0IGEgbGltaXQgdG8gYXZvaWRcbiAqIHVzZXJzIGJlaW5nIHN0dWNrIHdpdGggYSBzbG93LWNyYXNoLWxvb3Bpbmcgc2VydmVyLlxuICovXG5sZXQgcmVtYWluaW5nSnVweXRlclNlcnZlclJlc3RhcnRzOiBudW1iZXIgPSAyMDtcblxuLyoqXG4gKiBUaGUgYXBwbGljYXRpb24gc2V0dGluZ3MgaW5zdGFuY2UuXG4gKi9cbmxldCBhcHBTZXR0aW5nczogQXBwU2V0dGluZ3M7XG5cbi8qXG4gKiBUaGlzIGxpc3Qgb2YgbGV2ZWxzIHNob3VsZCBtYXRjaCB0aGUgb25lcyB1c2VkIGJ5IFB5dGhvbjpcbiAqICAgaHR0cHM6Ly9kb2NzLnB5dGhvbi5vcmcvMy9saWJyYXJ5L2xvZ2dpbmcuaHRtbCNsb2dnaW5nLWxldmVsc1xuICovXG5lbnVtIExvZ0xldmVscyB7XG4gIENSSVRJQ0FMID0gJ0NSSVRJQ0FMJyxcbiAgRVJST1IgPSAnRVJST1InLFxuICBXQVJOSU5HID0gJ1dBUk5JTkcnLFxuICBJTkZPID0gJ0lORk8nLFxuICBERUJVRyA9ICdERUJVRycsXG4gIE5PVFNFVCA9ICdOT1RTRVQnLFxufVxuXG5mdW5jdGlvbiBwaXBlT3V0cHV0KHN0cmVhbTogTm9kZUpTLlJlYWRhYmxlU3RyZWFtKSB7XG4gIHN0cmVhbS5zZXRFbmNvZGluZygndXRmOCcpO1xuXG4gIC8vIFRoZSBmb3JtYXQgd2UgcGFyc2UgaGVyZSBjb3JyZXNwb25kcyB0byB0aGUgbG9nIGZvcm1hdCB3ZSBzZXQgaW4gb3VyXG4gIC8vIGp1cHl0ZXIgY29uZmlndXJhdGlvbi5cbiAgY29uc3QgbG9nZ2VyID0gbG9nZ2luZy5nZXRKdXB5dGVyTG9nZ2VyKCk7XG4gIHN0cmVhbS5vbignZGF0YScsIChkYXRhOiBzdHJpbmcpID0+IHtcbiAgICBmb3IgKGNvbnN0IGxpbmUgb2YgZGF0YS5zcGxpdCgnXFxuJykpIHtcbiAgICAgIGlmIChsaW5lLnRyaW0oKS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCBwYXJ0cyA9IGxpbmUuc3BsaXQoJ3wnLCAzKTtcbiAgICAgIGlmIChwYXJ0cy5sZW5ndGggIT09IDMpIHtcbiAgICAgICAgLy8gTm9uLWxvZ2dpbmcgbWVzc2FnZXMgKGVnIHRyYWNlYmFja3MpIGdldCBsb2dnZWQgYXMgd2FybmluZ3MuXG4gICAgICAgIGxvZ2dlci53YXJuKGxpbmUpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGxldmVsID0gcGFydHNbMV07XG4gICAgICBjb25zdCBtZXNzYWdlID0gcGFydHNbMl07XG4gICAgICAvLyBXZSBuZWVkIHRvIG1hcCBQeXRob24ncyBsb2cgbGV2ZWxzIHRvIHRob3NlIHVzZWQgYnkgYnVueWFuLlxuICAgICAgaWYgKGxldmVsID09PSBMb2dMZXZlbHMuQ1JJVElDQUwgfHwgbGV2ZWwgPT09IExvZ0xldmVscy5FUlJPUikge1xuICAgICAgICBsb2dnZXIuZXJyb3IobWVzc2FnZSk7XG4gICAgICB9IGVsc2UgaWYgKGxldmVsID09PSBMb2dMZXZlbHMuV0FSTklORykge1xuICAgICAgICBsb2dnZXIud2FybihtZXNzYWdlKTtcbiAgICAgIH0gZWxzZSBpZiAobGV2ZWwgPT09IExvZ0xldmVscy5JTkZPKSB7XG4gICAgICAgIGxvZ2dlci5pbmZvKG1lc3NhZ2UpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gV2UgbWFwIERFQlVHLCBOT1RTRVQsIGFuZCBhbnkgdW5rbm93biBsb2cgbGV2ZWxzIHRvIGRlYnVnLlxuICAgICAgICBsb2dnZXIuZGVidWcobWVzc2FnZSk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlSnVweXRlclNlcnZlcigpIHtcbiAgaWYgKCFyZW1haW5pbmdKdXB5dGVyU2VydmVyUmVzdGFydHMpIHtcbiAgICBsb2dnaW5nLmdldExvZ2dlcigpLmVycm9yKCdObyBqdXB5dGVyIHJlc3RhcnQgYXR0ZW1wdHMgcmVtYWluaW5nLicpO1xuICAgIHJldHVybjtcbiAgfVxuICByZW1haW5pbmdKdXB5dGVyU2VydmVyUmVzdGFydHMgLT0gMTtcbiAgY29uc3QgcG9ydCA9IGFwcFNldHRpbmdzLm5leHRKdXB5dGVyUG9ydDtcbiAgbG9nZ2luZy5nZXRMb2dnZXIoKS5pbmZvKCdMYXVuY2hpbmcgSnVweXRlciBzZXJ2ZXIgYXQgJWQnLCBwb3J0KTtcbiAgY29uc3QganVweXRlckFyZ3MgPSBhcHBTZXR0aW5ncy5qdXB5dGVyQXJncyB8fCBbXTtcblxuICBmdW5jdGlvbiBleGl0SGFuZGxlcihjb2RlOiBudW1iZXIsIHNpZ25hbDogc3RyaW5nKTogdm9pZCB7XG4gICAgaWYgKGp1cHl0ZXJTZXJ2ZXIpIHtcbiAgICAgIGxvZ2dpbmcuZ2V0TG9nZ2VyKCkuZXJyb3IoXG4gICAgICAgICAgJ0p1cHl0ZXIgcHJvY2VzcyAlZCBleGl0ZWQgZHVlIHRvIHNpZ25hbDogJXMnLFxuICAgICAgICAgIGp1cHl0ZXJTZXJ2ZXIuY2hpbGRQcm9jZXNzLnBpZCEsIHNpZ25hbCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGxvZ2dpbmcuZ2V0TG9nZ2VyKCkuZXJyb3IoXG4gICAgICAgICAgJ0p1cHl0ZXIgcHJvY2VzcyBleGl0IGJlZm9yZSBzZXJ2ZXIgY3JlYXRpb24gZmluaXNoZWQgZHVlIHRvIHNpZ25hbDogJXMnLFxuICAgICAgICAgIHNpZ25hbCk7XG4gICAgfVxuICAgIC8vIFdlIHdhbnQgdG8gcmVzdGFydCBqdXB5dGVyIHdoZW5ldmVyIGl0IHRlcm1pbmF0ZXMuXG4gICAgY3JlYXRlSnVweXRlclNlcnZlcigpO1xuICB9XG5cbiAgY29uc3QgY29udGVudERpciA9IHBhdGguam9pbihhcHBTZXR0aW5ncy5kYXRhbGFiUm9vdCwgYXBwU2V0dGluZ3MuY29udGVudERpcik7XG4gIGNvbnN0IHByb2Nlc3NBcmdzID0gWydub3RlYm9vayddLmNvbmNhdChqdXB5dGVyQXJncyB8fCBbXSkuY29uY2F0KFtcbiAgICBgLS1wb3J0PSR7cG9ydH1gLFxuICAgIGAtLUZpbGVDb250ZW50c01hbmFnZXIucm9vdF9kaXI9JHthcHBTZXR0aW5ncy5kYXRhbGFiUm9vdH0vYCxcbiAgICAvLyBUT0RPKGIvMTM2NjU5NjI3KTogRGVsZXRlIHRoaXMgbGluZS5cbiAgICBgLS1NYXBwaW5nS2VybmVsTWFuYWdlci5yb290X2Rpcj0ke2NvbnRlbnREaXJ9YCxcbiAgXSk7XG5cbiAgbGV0IGp1cHl0ZXJTZXJ2ZXJBZGRyID0gJ2xvY2FsaG9zdCc7XG4gIGZvciAoY29uc3QgZmxhZyBvZiBqdXB5dGVyQXJncykge1xuICAgIC8vIEV4dHJhY3RzIGEgc3RyaW5nIGxpa2UgJzEuMi4zLjQnIGZyb20gdGhlIHN0cmluZyAnLS1pcD0xLjIuMy40J1xuICAgIGNvbnN0IG1hdGNoID0gZmxhZy5tYXRjaCgvLS1pcD0oW14gXSspLyk7XG4gICAgaWYgKG1hdGNoKSB7XG4gICAgICBqdXB5dGVyU2VydmVyQWRkciA9IG1hdGNoWzFdO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG4gIGxvZ2dpbmcuZ2V0TG9nZ2VyKCkuaW5mbyhcbiAgICAgICdVc2luZyBqdXB5dGVyIHNlcnZlciBhZGRyZXNzICVzJywganVweXRlclNlcnZlckFkZHIpO1xuXG4gIGNvbnN0IHByb2Nlc3NPcHRpb25zID0ge1xuICAgIGRldGFjaGVkOiBmYWxzZSxcbiAgICBlbnY6IHByb2Nlc3MuZW52LFxuICB9O1xuXG4gIGNvbnN0IHNlcnZlclByb2Nlc3MgPVxuICAgICAgY2hpbGRQcm9jZXNzLnNwYXduKCdqdXB5dGVyJywgcHJvY2Vzc0FyZ3MsIHByb2Nlc3NPcHRpb25zKTtcbiAgc2VydmVyUHJvY2Vzcy5vbignZXhpdCcsIGV4aXRIYW5kbGVyKTtcbiAgbG9nZ2luZy5nZXRMb2dnZXIoKS5pbmZvKFxuICAgICAgJ0p1cHl0ZXIgcHJvY2VzcyBzdGFydGVkIHdpdGggcGlkICVkIGFuZCBhcmdzICVqJywgc2VydmVyUHJvY2Vzcy5waWQhLFxuICAgICAgcHJvY2Vzc0FyZ3MpO1xuXG4gIC8vIENhcHR1cmUgdGhlIG91dHB1dCwgc28gaXQgY2FuIGJlIHBpcGVkIGZvciBsb2dnaW5nLlxuICBwaXBlT3V0cHV0KHNlcnZlclByb2Nlc3Muc3Rkb3V0KTtcbiAgcGlwZU91dHB1dChzZXJ2ZXJQcm9jZXNzLnN0ZGVycik7XG5cbiAgLy8gQ3JlYXRlIHRoZSBwcm94eS5cbiAgY29uc3QgcHJveHlUYXJnZXRIb3N0ID1cbiAgICAgIGFwcFNldHRpbmdzLmtlcm5lbE1hbmFnZXJQcm94eUhvc3QgfHwganVweXRlclNlcnZlckFkZHI7XG4gIGNvbnN0IHByb3h5VGFyZ2V0UG9ydCA9IGFwcFNldHRpbmdzLmtlcm5lbE1hbmFnZXJQcm94eVBvcnQgfHwgcG9ydDtcblxuICBjb25zdCBwcm94eSA9IGh0dHBQcm94eS5jcmVhdGVQcm94eVNlcnZlcihcbiAgICAgIHt0YXJnZXQ6IGBodHRwOi8vJHtwcm94eVRhcmdldEhvc3R9OiR7cHJveHlUYXJnZXRQb3J0fWB9KTtcbiAgcHJveHkub24oJ2Vycm9yJywgZXJyb3JIYW5kbGVyKTtcblxuICBqdXB5dGVyU2VydmVyID0ge3BvcnQsIHByb3h5LCBjaGlsZFByb2Nlc3M6IHNlcnZlclByb2Nlc3N9O1xufVxuXG4vKipcbiAqIEluaXRpYWxpemVzIHRoZSBKdXB5dGVyIHNlcnZlciBtYW5hZ2VyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaW5pdChzZXR0aW5nczogQXBwU2V0dGluZ3MpOiB2b2lkIHtcbiAgYXBwU2V0dGluZ3MgPSBzZXR0aW5ncztcbiAgY3JlYXRlSnVweXRlclNlcnZlcigpO1xufVxuXG4vKipcbiAqIENsb3NlcyB0aGUgSnVweXRlciBzZXJ2ZXIgbWFuYWdlci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNsb3NlKCk6IHZvaWQge1xuICBpZiAoIWp1cHl0ZXJTZXJ2ZXIpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBwaWQgPSBqdXB5dGVyU2VydmVyLmNoaWxkUHJvY2Vzcy5waWQ7XG4gIGxvZ2dpbmcuZ2V0TG9nZ2VyKCkuaW5mbyhganVweXRlciBjbG9zZTogUElEOiAke3BpZH1gKTtcbiAganVweXRlclNlcnZlci5jaGlsZFByb2Nlc3Mua2lsbCgnU0lHSFVQJyk7XG59XG5cbi8qKiBQcm94eSB0aGlzIHNvY2tldCByZXF1ZXN0IHRvIGp1cHl0ZXIuICovXG5leHBvcnQgZnVuY3Rpb24gaGFuZGxlU29ja2V0KFxuICAgIHJlcXVlc3Q6IGh0dHAuSW5jb21pbmdNZXNzYWdlLCBzb2NrZXQ6IG5ldC5Tb2NrZXQsIGhlYWQ6IEJ1ZmZlcikge1xuICBpZiAoIWp1cHl0ZXJTZXJ2ZXIpIHtcbiAgICBsb2dnaW5nLmdldExvZ2dlcigpLmVycm9yKCdKdXB5dGVyIHNlcnZlciBpcyBub3QgcnVubmluZy4nKTtcbiAgICByZXR1cm47XG4gIH1cbiAganVweXRlclNlcnZlci5wcm94eS53cyhyZXF1ZXN0LCBzb2NrZXQsIGhlYWQpO1xufVxuXG4vKiogUHJveHkgdGhpcyBIVFRQIHJlcXVlc3QgdG8ganVweXRlci4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoYW5kbGVSZXF1ZXN0KFxuICAgIHJlcXVlc3Q6IGh0dHAuSW5jb21pbmdNZXNzYWdlLCByZXNwb25zZTogaHR0cC5TZXJ2ZXJSZXNwb25zZSkge1xuICBpZiAoIWp1cHl0ZXJTZXJ2ZXIpIHtcbiAgICByZXNwb25zZS5zdGF0dXNDb2RlID0gNTAwO1xuICAgIHJlc3BvbnNlLmVuZCgpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGp1cHl0ZXJTZXJ2ZXIucHJveHkud2ViKHJlcXVlc3QsIHJlc3BvbnNlLCBudWxsKTtcbn1cblxuZnVuY3Rpb24gZXJyb3JIYW5kbGVyKFxuICAgIGVycm9yOiBFcnJvciwgcmVxdWVzdDogaHR0cC5JbmNvbWluZ01lc3NhZ2UsXG4gICAgcmVzcG9uc2U6IGh0dHAuU2VydmVyUmVzcG9uc2UpIHtcbiAgbG9nZ2luZy5nZXRMb2dnZXIoKS5lcnJvcihlcnJvciwgJ0p1cHl0ZXIgc2VydmVyIHJldHVybmVkIGVycm9yLicpO1xuXG4gIHJlc3BvbnNlLndyaXRlSGVhZCg1MDAsICdJbnRlcm5hbCBTZXJ2ZXIgRXJyb3InKTtcbiAgcmVzcG9uc2UuZW5kKCk7XG59XG4iXX0=
