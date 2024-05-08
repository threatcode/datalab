"use strict";
/*
 * Copyright 2020 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketToPty = exports.SocketIoToPty = void 0;
var nodePty = require("node-pty");
var socketio = require("socket.io");
var ws_1 = require("ws");
var logging = require("./logging");
var sockets_1 = require("./sockets");
var sessionCounter = 0;
// Inspired by
// https://xtermjs.org/docs/guides/flowcontrol/#ideas-for-a-better-mechanism.
var ACK_CALLBACK_EVERY_BYTES = 100000;
var UNACKED_HIGH_WATERMARK = 5;
var UNACKED_LOW_WATERMARK = 2;
/** Socket<->terminal adapter. */
var Session = /** @class */ (function () {
    function Session(socket) {
        var _this = this;
        this.socket = socket;
        this.pendingAckCallbacks = 0;
        this.writtenBytes = 0;
        this.id = sessionCounter++;
        this.socket.onClose(function (reason) {
            logging.getLogger().debug('PTY socket disconnected for session %d reason: %s', _this.id, reason);
            // Handle client disconnects to close sockets, so as to free up resources.
            _this.close();
        });
        this.socket.onStringMessage(function (data) {
            // Propagate the message over to the pty.
            logging.getLogger().debug('Send data in session %d\n%s', _this.id, data);
            var message = JSON.parse(data);
            if (message.data) {
                _this.pty.write(message.data);
            }
            if (message.cols && message.rows) {
                _this.pty.resize(message.cols, message.rows);
            }
            if (message.ack) {
                _this.pendingAckCallbacks--;
                if (_this.pendingAckCallbacks < UNACKED_LOW_WATERMARK) {
                    _this.pty.resume();
                }
            }
        });
        this.pty = nodePty.spawn('tmux', ['new-session', '-A', '-D', '-s', '0'], {
            name: 'xterm-color',
            cwd: './content', // Which path should terminal start
            // Pass environment variables
            env: process.env,
        });
        this.pty.onData(function (data) {
            _this.writtenBytes += data.length;
            if (_this.writtenBytes < ACK_CALLBACK_EVERY_BYTES) {
                var message = { data: data };
                _this.socket.sendString(JSON.stringify(message));
            }
            else {
                var message = { data: data, ack: true };
                _this.socket.sendString(JSON.stringify(message));
                _this.pendingAckCallbacks++;
                _this.writtenBytes = 0;
                if (_this.pendingAckCallbacks > UNACKED_HIGH_WATERMARK) {
                    _this.pty.pause();
                }
            }
        });
        this.pty.onExit(function (_a) {
            var exitCode = _a.exitCode, signal = _a.signal;
            _this.socket.close(false);
        });
    }
    Session.prototype.close = function () {
        this.socket.close(false);
        this.pty.kill();
    };
    return Session;
}());
/** SocketIO to node-pty adapter. */
var SocketIoToPty = /** @class */ (function () {
    function SocketIoToPty(path, server) {
        this.path = path;
        var io = socketio(server, {
            path: path,
            transports: ['polling'],
            allowUpgrades: false,
            // v2.10 changed default from 60s to 5s, prefer the longer timeout to
            // avoid errant disconnects.
            pingTimeout: 60000,
        });
        io.of('/').on('connection', function (socket) {
            // Session manages its own lifetime.
            // tslint:disable-next-line:no-unused-expression
            new Session(new sockets_1.SocketIOAdapter(socket));
        });
    }
    /** Return true iff path is handled by socket.io. */
    SocketIoToPty.prototype.isPathProxied = function (path) {
        return path.indexOf(this.path + '/') === 0;
    };
    return SocketIoToPty;
}());
exports.SocketIoToPty = SocketIoToPty;
/** WebSocket to pty adapter. */
function WebSocketToPty(request, sock, head) {
    new ws_1.Server({ noServer: true }).handleUpgrade(request, sock, head, function (ws) {
        // Session manages its own lifetime.
        // tslint:disable-next-line:no-unused-expression
        new Session(new sockets_1.WebSocketAdapter(ws));
    });
}
exports.WebSocketToPty = WebSocketToPty;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic29ja2V0aW9fdG9fcHR5LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vdGhpcmRfcGFydHkvY29sYWIvc291cmNlcy9zb2NrZXRpb190b19wdHkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7OztHQWNHOzs7QUFJSCxrQ0FBb0M7QUFDcEMsb0NBQXNDO0FBQ3RDLHlCQUEwQjtBQUUxQixtQ0FBcUM7QUFDckMscUNBQW9FO0FBU3BFLElBQUksY0FBYyxHQUFHLENBQUMsQ0FBQztBQUV2QixjQUFjO0FBQ2QsNkVBQTZFO0FBQzdFLElBQU0sd0JBQXdCLEdBQUcsTUFBTSxDQUFDO0FBQ3hDLElBQU0sc0JBQXNCLEdBQUcsQ0FBQyxDQUFDO0FBQ2pDLElBQU0scUJBQXFCLEdBQUcsQ0FBQyxDQUFDO0FBRWhDLGlDQUFpQztBQUNqQztJQU1FLGlCQUE2QixNQUFjO1FBQTNDLGlCQTBEQztRQTFENEIsV0FBTSxHQUFOLE1BQU0sQ0FBUTtRQUhuQyx3QkFBbUIsR0FBRyxDQUFDLENBQUM7UUFDeEIsaUJBQVksR0FBRyxDQUFDLENBQUM7UUFHdkIsSUFBSSxDQUFDLEVBQUUsR0FBRyxjQUFjLEVBQUUsQ0FBQztRQUUzQixJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxVQUFDLE1BQU07WUFDekIsT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFDLEtBQUssQ0FDckIsbURBQW1ELEVBQUUsS0FBSSxDQUFDLEVBQUUsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUUxRSwwRUFBMEU7WUFDMUUsS0FBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ2YsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxVQUFDLElBQVk7WUFDdkMseUNBQXlDO1lBQ3pDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxLQUFLLENBQUMsNkJBQTZCLEVBQUUsS0FBSSxDQUFDLEVBQUUsRUFB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QUFHLFFBQVEsQ0FBQyxNQUFNLEVBQUU7WUFDMUIsSUFBSSxNQUFBO1lBQ0osVUFBVSxFQUFFLENBQUMsU0FBUyxDQUFDO1lBQ3ZCLGFBQWEsRUFBRSxLQUFLO1lBQ3BCLHFFQUFxRTtZQUNyRSw0QkFBNEI7WUFDNUIsV0FBVyxFQUFFLEtBQUs7U0FDbkIsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsWUFBWSxFQUFFLFVBQUMsTUFBdUI7WUFDbEQsb0NBQW9DO1lBQ3BDLGdEQUFnRDtZQUNoRCxJQUFJLE9BQU8sQ0FBQyxJQUFJLHlCQUFlLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUMzQyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRCxvREFBb0Q7SUFDcEQscUNBQWEsR0FBYixVQUFjLElBQVk7UUFDeEIsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzdDLENBQUM7SUFDSCxvQkFBQztBQUFELENBQUMsQUF0QkQsSUFzQkM7QUF0Qlksc0NBQWE7QUF5QjFCLGdDQUFnQztBQUNoQyxTQUFnQixjQUFjLENBQzFCLE9BQTZCLEVBQUUsSUFBZ0IsRUFBRSxJQUFZO0lBQy9ELElBQUksV0FBTSxDQUFDLEVBQUMsUUFBUSxFQUFFLElBQUksRUFBQyxDQUFDLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLFVBQUMsRUFBRTtRQUNqRSxvQ0FBb0M7UUFDcEMsZ0RBQWdEO1FBQ2hELElBQUksT0FBTyxDQUFDLElBQUksMEJBQWdCLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUN4QyxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUM7QUFQRCx3Q0FPQyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgMjAyMCBHb29nbGUgSW5jLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICpcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7IHlvdSBtYXkgbm90XG4gKiB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZlxuICogdGhlIExpY2Vuc2UgYXRcbiAqXG4gKiBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbiAqXG4gKiBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4gKiBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsIFdJVEhPVVRcbiAqIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC4gU2VlIHRoZVxuICogTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmQgbGltaXRhdGlvbnMgdW5kZXJcbiAqIHRoZSBMaWNlbnNlLlxuICovXG5cbmltcG9ydCAqIGFzIGh0dHAgZnJvbSAnaHR0cCc7XG5pbXBvcnQgKiBhcyBuZXQgZnJvbSAnbmV0JztcbmltcG9ydCAqIGFzIG5vZGVQdHkgZnJvbSAnbm9kZS1wdHknO1xuaW1wb3J0ICogYXMgc29ja2V0aW8gZnJvbSAnc29ja2V0LmlvJztcbmltcG9ydCB7U2VydmVyfSBmcm9tICd3cyc7XG5cbmltcG9ydCAqIGFzIGxvZ2dpbmcgZnJvbSAnLi9sb2dnaW5nJztcbmltcG9ydCB7U29ja2V0LCBTb2NrZXRJT0FkYXB0ZXIsIFdlYlNvY2tldEFkYXB0ZXJ9IGZyb20gJy4vc29ja2V0cyc7XG5cblxuLy8gUGF1c2UgYW5kIHJlc3VtZSBhcmUgbWlzc2luZyBmcm9tIHRoZSB0eXBpbmdzLlxuaW50ZXJmYWNlIFB0eSB7XG4gIHBhdXNlKCk6IHZvaWQ7XG4gIHJlc3VtZSgpOiB2b2lkO1xufVxuXG5sZXQgc2Vzc2lvbkNvdW50ZXIgPSAwO1xuXG4vLyBJbnNwaXJlZCBieVxuLy8gaHR0cHM6Ly94dGVybWpzLm9yZy9kb2NzL2d1aWRlcy9mbG93Y29udHJvbC8jaWRlYXMtZm9yLWEtYmV0dGVyLW1lY2hhbmlzbS5cbmNvbnN0IEFDS19DQUxMQkFDS19FVkVSWV9CWVRFUyA9IDEwMDAwMDtcbmNvbnN0IFVOQUNLRURfSElHSF9XQVRFUk1BUksgPSA1O1xuY29uc3QgVU5BQ0tFRF9MT1dfV0FURVJNQVJLID0gMjtcblxuLyoqIFNvY2tldDwtPnRlcm1pbmFsIGFkYXB0ZXIuICovXG5jbGFzcyBTZXNzaW9uIHtcbiAgcHJpdmF0ZSByZWFkb25seSBpZDogbnVtYmVyO1xuICBwcml2YXRlIHJlYWRvbmx5IHB0eTogbm9kZVB0eS5JUHR5O1xuICBwcml2YXRlIHBlbmRpbmdBY2tDYWxsYmFja3MgPSAwO1xuICBwcml2YXRlIHdyaXR0ZW5CeXRlcyA9IDA7XG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBzb2NrZXQ6IFNvY2tldCkge1xuICAgIHRoaXMuaWQgPSBzZXNzaW9uQ291bnRlcisrO1xuXG4gICAgdGhpcy5zb2NrZXQub25DbG9zZSgocmVhc29uKSA9PiB7XG4gICAgICBsb2dnaW5nLmdldExvZ2dlcigpLmRlYnVnKFxuICAgICAgICAgICdQVFkgc29ja2V0IGRpc2Nvbm5lY3RlZCBmb3Igc2Vzc2lvbiAlZCByZWFzb246ICVzJywgdGhpcy5pZCwgcmVhc29uKTtcblxuICAgICAgLy8gSGFuZGxlIGNsaWVudCBkaXNjb25uZWN0cyB0byBjbG9zZSBzb2NrZXRzLCBzbyBhcyB0byBmcmVlIHVwIHJlc291cmNlcy5cbiAgICAgIHRoaXMuY2xvc2UoKTtcbiAgICB9KTtcblxuICAgIHRoaXMuc29ja2V0Lm9uU3RyaW5nTWVzc2FnZSgoZGF0YTogc3RyaW5nKSA9PiB7XG4gICAgICAvLyBQcm9wYWdhdGUgdGhlIG1lc3NhZ2Ugb3ZlciB0byB0aGUgcHR5LlxuICAgICAgbG9nZ2luZy5nZXRMb2dnZXIoKS5kZWJ1ZygnU2VuZCBkYXRhIGluIHNlc3Npb24gJWRcXG4lcycsIHRoaXMuaWQsIGRhdGEpO1xuICAgICAgY29uc3QgbWVzc2FnZSA9IEpTT04ucGFyc2UoZGF0YSkgYXMgSW5jb21pbmdNZXNzYWdlO1xuICAgICAgaWYgKG1lc3NhZ2UuZGF0YSkge1xuICAgICAgICB0aGlzLnB0eS53cml0ZShtZXNzYWdlLmRhdGEpO1xuICAgICAgfVxuICAgICAgaWYgKG1lc3NhZ2UuY29scyAmJiBtZXNzYWdlLnJvd3MpIHtcbiAgICAgICAgdGhpcy5wdHkucmVzaXplKG1lc3NhZ2UuY29scywgbWVzc2FnZS5yb3dzKTtcbiAgICAgIH1cbiAgICAgIGlmIChtZXNzYWdlLmFjaykge1xuICAgICAgICB0aGlzLnBlbmRpbmdBY2tDYWxsYmFja3MtLTtcbiAgICAgICAgaWYgKHRoaXMucGVuZGluZ0Fja0NhbGxiYWNrcyA8IFVOQUNLRURfTE9XX1dBVEVSTUFSSykge1xuICAgICAgICAgICh0aGlzLnB0eSBhcyB1bmtub3duIGFzIFB0eSkucmVzdW1lKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHRoaXMucHR5ID0gbm9kZVB0eS5zcGF3bigndG11eCcsIFsnbmV3LXNlc3Npb24nLCAnLUEnLCAnLUQnLCAnLXMnLCAnMCddLCB7XG4gICAgICBuYW1lOiAneHRlcm0tY29sb3InLFxuICAgICAgY3dkOiAnLi9jb250ZW50JywgIC8vIFdoaWNoIHBhdGggc2hvdWxkIHRlcm1pbmFsIHN0YXJ0XG4gICAgICAvLyBQYXNzIGVudmlyb25tZW50IHZhcmlhYmxlc1xuICAgICAgZW52OiBwcm9jZXNzLmVudiBhcyB7XG4gICAgICAgIFtrZXk6IHN0cmluZ106IHN0cmluZztcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLnB0eS5vbkRhdGEoKGRhdGE6IHN0cmluZykgPT4ge1xuICAgICAgdGhpcy53cml0dGVuQnl0ZXMgKz0gZGF0YS5sZW5ndGg7XG4gICAgICBpZiAodGhpcy53cml0dGVuQnl0ZXMgPCBBQ0tfQ0FMTEJBQ0tfRVZFUllfQllURVMpIHtcbiAgICAgICAgY29uc3QgbWVzc2FnZTogT3V0Z29pbmdNZXNzYWdlID0ge2RhdGF9O1xuICAgICAgICB0aGlzLnNvY2tldC5zZW5kU3RyaW5nKEpTT04uc3RyaW5naWZ5KG1lc3NhZ2UpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IG1lc3NhZ2U6IE91dGdvaW5nTWVzc2FnZSA9IHtkYXRhLCBhY2s6IHRydWV9O1xuICAgICAgICB0aGlzLnNvY2tldC5zZW5kU3RyaW5nKEpTT04uc3RyaW5naWZ5KG1lc3NhZ2UpKTtcbiAgICAgICAgdGhpcy5wZW5kaW5nQWNrQ2FsbGJhY2tzKys7XG4gICAgICAgIHRoaXMud3JpdHRlbkJ5dGVzID0gMDtcbiAgICAgICAgaWYgKHRoaXMucGVuZGluZ0Fja0NhbGxiYWNrcyA+IFVOQUNLRURfSElHSF9XQVRFUk1BUkspIHtcbiAgICAgICAgICAodGhpcy5wdHkgYXMgdW5rbm93biBhcyBQdHkpLnBhdXNlKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHRoaXMucHR5Lm9uRXhpdChcbiAgICAgICAgKHtleGl0Q29kZSwgc2lnbmFsfToge2V4aXRDb2RlOiBudW1iZXIsIHNpZ25hbD86IG51bWJlcn0pID0+IHtcbiAgICAgICAgICB0aGlzLnNvY2tldC5jbG9zZShmYWxzZSk7XG4gICAgICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBjbG9zZSgpIHtcbiAgICB0aGlzLnNvY2tldC5jbG9zZShmYWxzZSk7XG4gICAgdGhpcy5wdHkua2lsbCgpO1xuICB9XG59XG5cbi8qKiBTb2NrZXRJTyB0byBub2RlLXB0eSBhZGFwdGVyLiAqL1xuZXhwb3J0IGNsYXNzIFNvY2tldElvVG9QdHkge1xuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IHBhdGg6IHN0cmluZywgc2VydmVyOiBodHRwLlNlcnZlcikge1xuICAgIGNvbnN0IGlvID0gc29ja2V0aW8oc2VydmVyLCB7XG4gICAgICBwYXRoLFxuICAgICAgdHJhbnNwb3J0czogWydwb2xsaW5nJ10sXG4gICAgICBhbGxvd1VwZ3JhZGVzOiBmYWxzZSxcbiAgICAgIC8vIHYyLjEwIGNoYW5nZWQgZGVmYXVsdCBmcm9tIDYwcyB0byA1cywgcHJlZmVyIHRoZSBsb25nZXIgdGltZW91dCB0b1xuICAgICAgLy8gYXZvaWQgZXJyYW50IGRpc2Nvbm5lY3RzLlxuICAgICAgcGluZ1RpbWVvdXQ6IDYwMDAwLFxuICAgIH0pO1xuXG4gICAgaW8ub2YoJy8nKS5vbignY29ubmVjdGlvbicsIChzb2NrZXQ6IFNvY2tldElPLlNvY2tldCkgPT4ge1xuICAgICAgLy8gU2Vzc2lvbiBtYW5hZ2VzIGl0cyBvd24gbGlmZXRpbWUuXG4gICAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6bm8tdW51c2VkLWV4cHJlc3Npb25cbiAgICAgIG5ldyBTZXNzaW9uKG5ldyBTb2NrZXRJT0FkYXB0ZXIoc29ja2V0KSk7XG4gICAgfSk7XG4gIH1cblxuICAvKiogUmV0dXJuIHRydWUgaWZmIHBhdGggaXMgaGFuZGxlZCBieSBzb2NrZXQuaW8uICovXG4gIGlzUGF0aFByb3hpZWQocGF0aDogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHBhdGguaW5kZXhPZih0aGlzLnBhdGggKyAnLycpID09PSAwO1xuICB9XG59XG5cblxuLyoqIFdlYlNvY2tldCB0byBwdHkgYWRhcHRlci4gKi9cbmV4cG9ydCBmdW5jdGlvbiBXZWJTb2NrZXRUb1B0eShcbiAgICByZXF1ZXN0OiBodHRwLkluY29taW5nTWVzc2FnZSwgc29jazogbmV0LlNvY2tldCwgaGVhZDogQnVmZmVyKSB7XG4gIG5ldyBTZXJ2ZXIoe25vU2VydmVyOiB0cnVlfSkuaGFuZGxlVXBncmFkZShyZXF1ZXN0LCBzb2NrLCBoZWFkLCAod3MpID0+IHtcbiAgICAvLyBTZXNzaW9uIG1hbmFnZXMgaXRzIG93biBsaWZldGltZS5cbiAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6bm8tdW51c2VkLWV4cHJlc3Npb25cbiAgICBuZXcgU2Vzc2lvbihuZXcgV2ViU29ja2V0QWRhcHRlcih3cykpO1xuICB9KTtcbn1cblxuZGVjbGFyZSBpbnRlcmZhY2UgSW5jb21pbmdNZXNzYWdlIHtcbiAgcmVhZG9ubHkgZGF0YT86IHN0cmluZztcbiAgcmVhZG9ubHkgY29scz86IG51bWJlcjtcbiAgcmVhZG9ubHkgcm93cz86IG51bWJlcjtcbiAgcmVhZG9ubHkgYWNrPzogYm9vbGVhbjtcbn1cblxuZGVjbGFyZSBpbnRlcmZhY2UgT3V0Z29pbmdNZXNzYWdlIHtcbiAgcmVhZG9ubHkgZGF0YT86IHN0cmluZztcbiAgcmVhZG9ubHkgYWNrPzogYm9vbGVhbjtcbn1cbiJdfQ==
