/**
 * Copyright (C) 2024- Mohammad Reza Kamali <company@medaibot.com>.
 * All rights reserved.
 */
var _SSEvent = /** @class */ (function () {
    function _SSEvent() {
    }
    return _SSEvent;
}());
var SSE = /** @class */ (function () {
    function SSE(url, options) {
        var _this = this;
        this.stream = function () {
            if (_this.xhr) {
                // Already connected.
                return;
            }
            _this._setReadyState(SSE.CONNECTING);
            _this.xhr = new XMLHttpRequest();
            _this.xhr.addEventListener('progress', _this._onStreamProgress.bind(_this));
            _this.xhr.addEventListener('load', _this._onStreamLoaded.bind(_this));
            _this.xhr.addEventListener('readystatechange', _this._checkStreamClosed.bind(_this));
            _this.xhr.addEventListener('error', _this._onStreamFailure.bind(_this));
            _this.xhr.addEventListener('abort', _this._onStreamAbort.bind(_this));
            _this.xhr.open(_this.method, _this.url);
            for (var header in _this.headers) {
                _this.xhr.setRequestHeader(header, _this.headers[header]);
            }
            if (_this.lastEventId.length > 0) {
                _this.xhr.setRequestHeader("Last-Event-ID", _this.lastEventId);
            }
            _this.xhr.withCredentials = _this.withCredentials;
            _this.xhr.send(_this.payload);
        };
        this.close = function () {
            if (_this.readyState === SSE.CLOSED) {
                return;
            }
            if (_this.xhr) {
                _this.xhr.abort();
                _this.xhr = null;
            }
            _this._setReadyState(SSE.CLOSED);
        };
        this.url = url;
        options = options || {};
        this.headers = options.headers || {};
        this.payload = options.payload || '';
        this.method = options.method || (this.payload ? 'POST' : 'GET');
        this.withCredentials = !!options.withCredentials;
        this.debug = !!options.debug;
        this.listeners = {};
        this.xhr = null;
        this.readyState = SSE.INITIALIZING;
        this.progress = 0;
        this.chunk = '';
        this.lastEventId = '';
        if (options.start === undefined || options.start) {
            this.stream();
        }
    }
    SSE.prototype.addEventListener = function (type, listener) {
        if (!this.listeners[type]) {
            this.listeners[type] = [];
        }
        if (this.listeners[type].indexOf(listener) === -1) {
            this.listeners[type].push(listener);
        }
    };
    SSE.prototype.removeEventListener = function (type, listener) {
        if (!this.listeners[type]) {
            return;
        }
        this.listeners[type] = this.listeners[type].filter(function (l) { return l !== listener; });
        if (this.listeners[type].length === 0) {
            delete this.listeners[type];
        }
    };
    SSE.prototype.dispatchEvent = function (e) {
        if (!e) {
            return true;
        }
        if (this.debug) {
            console.debug(e);
        }
        e.source = this;
        var handler = "on".concat(e.type);
        if (this[handler]) {
            this[handler].call(this, e);
            if (e.defaultPrevented) {
                return false;
            }
        }
        if (this.listeners[e.type]) {
            return this.listeners[e.type].every(function (callback) {
                callback(e);
                return !e.defaultPrevented;
            });
        }
        return true;
    };
    SSE.prototype._setReadyState = function (state) {
        var event = new CustomEvent("readystatechange");
        event.readyState = state;
        this.readyState = state;
        console.log("readyState", this.readyState);
        console.log("state", state);
        var ssevent = event;
        this.dispatchEvent(ssevent);
    };
    SSE.prototype._onStreamFailure = function (e) {
        var event = new CustomEvent("error");
        event.data = e.currentTarget.response;
        var ssevent = event;
        this.dispatchEvent(ssevent);
        this.close();
    };
    SSE.prototype._onStreamAbort = function () {
        var event = new CustomEvent("abort");
        var ssevent = event;
        this.dispatchEvent(ssevent);
        this.close();
    };
    SSE.prototype._onStreamProgress = function (e) {
        if (!this.xhr) {
            return;
        }
        if (this.xhr.status !== 200) {
            this._onStreamFailure(e);
            return;
        }
        if (this.readyState === SSE.CONNECTING) {
            var event_1 = new CustomEvent("open");
            var ssevent = event_1;
            this.dispatchEvent(ssevent);
            this._setReadyState(SSE.OPEN);
        }
        var data = this.xhr.responseText.substring(this.progress);
        this.progress += data.length;
        var parts = (this.chunk + data).split(/(\r\n\r\n|\r\r|\n\n)/g);
        /*
         * We assume that the last chunk can be incomplete because of buffering or other network effects,
         * so we always save the last part to merge it with the next incoming packet
         */
        var lastPart = parts.pop() || "";
        parts.forEach(function (part) {
            if (part.trim().length > 0) {
                // @ts-ignore
                this.dispatchEvent(this._parseEventChunk(part));
            }
        }.bind(this) // Add .bind(this) to provide a type annotation for 'this'
        );
        this.chunk = lastPart;
    };
    SSE.prototype._onStreamLoaded = function (e) {
        this._onStreamProgress(e);
        // Parse the last chunk.
        var event = this._parseEventChunk(this.chunk);
        if (event) {
            this.dispatchEvent(event);
        }
        this.chunk = "";
    };
    /**
     * Parse a received SSE event chunk into a constructed event object.
     *
     * Reference: https://html.spec.whatwg.org/multipage/server-sent-events.html#dispatchMessage
     */
    SSE.prototype._parseEventChunk = function (chunk) {
        if (!chunk || chunk.length === 0) {
            return null;
        }
        if (this.debug) {
            console.debug(chunk);
        }
        var e = { id: null, retry: null, data: null, event: null };
        chunk.split(/\n|\r\n|\r/).forEach(function (line) {
            var index = line.indexOf(SSE.FIELD_SEPARATOR);
            console.log(line, index);
            var field, value;
            if (index > 0) {
                // only first whitespace should be trimmed
                var skip = (line[index + 1] === ' ') ? 2 : 1;
                field = line.substring(0, index);
                value = line.substring(index + skip);
                console.log(field, value);
            }
            else if (index < 0) {
                // Interpret the entire line as the field name, and use the empty string as the field value
                field = line;
                value = '';
                console.log('do we get here?');
            }
            else {
                // A colon is the first character. This is a comment; ignore it.
                return;
            }
            console.log('hhhhh', field, e);
            console.log(!(field in e));
            if (!(field in e)) {
                //console.log('do we get here?')
                return;
            }
            // consecutive 'data' is concatenated with newlines
            if (field === 'data' && e[field] !== null) {
                e['data'] += "\n" + value;
            }
            else {
                //! added index signature to e
                e[field] = value;
                console.log(e === null || e === void 0 ? void 0 : e['field']);
            }
        }.bind(this) //, this // Add .bind(this), to provide a type annotation for 'this'
        );
        if (e.id !== null) {
            this.lastEventId = e.id;
        }
        var event = new CustomEvent(e.event || 'message');
        var ssevent = event;
        ssevent.id = e.id;
        ssevent.data = e.data || '';
        ssevent.lastEventId = this.lastEventId;
        return ssevent;
    };
    SSE.prototype._checkStreamClosed = function () {
        if (!this.xhr) {
            return;
        }
        if (this.xhr.readyState === XMLHttpRequest.DONE) {
            this._setReadyState(SSE.CLOSED);
        }
    };
    SSE.INITIALIZING = -1;
    SSE.CONNECTING = 0;
    SSE.OPEN = 1;
    SSE.CLOSED = 2;
    SSE.FIELD_SEPARATOR = ':';
    return SSE;
}());
export { SSE };
