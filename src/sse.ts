/**
 * Copyright (C) 2024- Mohammad Reza Kamali <company@medaibot.com>.
 * All rights reserved.
 */

/**
 * Copyright (C) 2016-2023 Maxime Petazzoni <maxime.petazzoni@bulix.org>.
 * All rights reserved.
 */


interface SSEOptions {
  headers?: {[key: string]: string};
  payload?: string;
  method?: string; 
  withCredentials?: boolean;
  start?: boolean;
  debug?: boolean;
}

type MyCustomEvent<T> = Partial<T> & {
  readyState?: number | string;
  data?: string;
}

class _SSEvent {
  id!: string | null;
  data!: string;
  source?: SSE;
  type?: string
  lastEventId?: string;
}

type SSEvent = _SSEvent & Event;

class SSE {

  static INITIALIZING: number = -1;
  static CONNECTING: number = 0;
  static OPEN: number = 1;
  static CLOSED: number = 2;
  static FIELD_SEPARATOR: string = ':';

  url: string;
  headers: {[key: string]: string};
  payload: string;
  method: string;
  withCredentials: boolean;
  debug: boolean;

  listeners: {[key: string]: EventListener[]};

  xhr: XMLHttpRequest | null;
  readyState: number | string;
  progress: number;
  chunk: string;
  lastEventId: string;

  constructor(url: string, options?: SSEOptions) {
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

  onmessage!: (event: SSEvent) => void;
  onopen!: (event: SSEvent) => void;
  onload!: (event: SSEvent) => void;
  onreadystatechange!: (event: SSEvent) => void;
  onerror!: (event: SSEvent) => void;
  onabort!: (event: SSEvent) => void;

  addEventListener(type: string, listener: EventListener) {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    if (this.listeners[type].indexOf(listener) === -1) {
      this.listeners[type].push(listener);
    }
  }

  removeEventListener(type: string, listener: EventListener) {
    if (!this.listeners[type]) {
      return;
    }
    this.listeners[type] = this.listeners[type].filter(l => l !== listener);
    if (this.listeners[type].length === 0) {
      delete this.listeners[type];
    }
  }

  dispatchEvent(e: SSEvent) {
    if (!e) {
      return true;
    }

    if (this.debug) {
      console.debug(e);
    }

    e.source = this;

    const handler = `on${e.type}` as keyof this;

    if (this[handler]) {
      (this[handler] as Function).call(this, e);
      if (e.defaultPrevented) {
        return false;
      }
    }

    if (this.listeners[e.type]) {
      return this.listeners[e.type].every((callback) => {
        callback(e);
        return !e.defaultPrevented;
      });
    }

    return true;
  }


  
  private _setReadyState(state: ReadyState | number) {
    const event: MyCustomEvent<CustomEvent> = new CustomEvent("readystatechange");
    event.readyState = state;
    this.readyState = state;
    console.log("readyState", this.readyState);
    console.log("state", state);
    const ssevent = event as SSEvent;
    this.dispatchEvent(ssevent);
  }




  private _onStreamFailure(e: Event) {
    const event: MyCustomEvent<CustomEvent> = new CustomEvent("error");
    event.data = (e.currentTarget as XMLHttpRequest).response;
    const ssevent = event as SSEvent;
    this.dispatchEvent(ssevent);
    this.close();
  }


  private _onStreamAbort() {
    const event: MyCustomEvent<CustomEvent> = new CustomEvent("abort");
    const ssevent = event as SSEvent;
  this.dispatchEvent(ssevent);
  this.close();
  }

  private _onStreamProgress(e: ProgressEvent) {
    if (!this.xhr) {
      return;
    }

    if (this.xhr.status !== 200) {
      this._onStreamFailure(e);
      return;
    }

    if (this.readyState === SSE.CONNECTING) {
      const event: MyCustomEvent<CustomEvent> = new CustomEvent("open");
      const ssevent = event as SSEvent;
      this.dispatchEvent(ssevent);
      this._setReadyState(SSE.OPEN);
    }

    const data = (this.xhr as XMLHttpRequest).responseText.substring(
      this.progress
    );

    this.progress += data.length;
    const parts = (this.chunk + data).split(/(\r\n\r\n|\r\r|\n\n)/g);

    /*
     * We assume that the last chunk can be incomplete because of buffering or other network effects,
     * so we always save the last part to merge it with the next incoming packet
     */
    const lastPart = parts.pop() || "";
    parts.forEach(
      function (part: string) {
        if (part.trim().length > 0) {
          // @ts-ignore
          this.dispatchEvent(this._parseEventChunk(part));
        }
      }.bind(this) // Add .bind(this) to provide a type annotation for 'this'
    );
    this.chunk = lastPart;
  }

  private _onStreamLoaded(e: ProgressEvent) {
    this._onStreamProgress(e);

    // Parse the last chunk.
    const event = this._parseEventChunk(this.chunk);
    if (event) {
      this.dispatchEvent(event);
    }

    this.chunk = "";
  }


  /**
   * Parse a received SSE event chunk into a constructed event object.
   *
   * Reference: https://html.spec.whatwg.org/multipage/server-sent-events.html#dispatchMessage
   */
  private _parseEventChunk(chunk: string): SSEvent | null {
    if (!chunk || chunk.length === 0) {
      return null;
    }

    if (this.debug) {
      console.debug(chunk);
    }
    
    const e: {id: string | null, retry: string | null, data: string | null, event: string | null, [key: string]: string | null} = {id: null, retry: null, data: null, event: null};
    chunk.split(/\n|\r\n|\r/).forEach(function(line: string) {
      const index = line.indexOf(SSE.FIELD_SEPARATOR);
      console.log(line, index)
      let field: string, value: string;
      if (index > 0) {
        // only first whitespace should be trimmed
        const skip = (line[index + 1] === ' ') ? 2 : 1;
        field = line.substring(0, index);
        value = line.substring(index + skip);
        console.log(field, value)
      } else if (index < 0) {
        // Interpret the entire line as the field name, and use the empty string as the field value
        field = line;
        value = '';
        console.log('do we get here?')
      } else {
        // A colon is the first character. This is a comment; ignore it.
        return;
      }

      console.log('hhhhh', field, e)
      console.log(!(field in e))

      if (!(field in e)) {
        //console.log('do we get here?')
        return;
      }

      // consecutive 'data' is concatenated with newlines
      if (field === 'data' && e[field] !== null) {
          e['data'] += "\n" + value;
      } else {
        //! added index signature to e
        e[field] = value;
        console.log(e?.['field'])
      }
    }.bind(this)             //, this // Add .bind(this), to provide a type annotation for 'this'
    );

    if (e.id !== null) {
      this.lastEventId = e.id;
    }

    const event = new CustomEvent(e.event || 'message');
    const ssevent = event as unknown as SSEvent;
    ssevent.id = e.id;
    ssevent.data = e.data || '';
    ssevent.lastEventId = this.lastEventId;
    return ssevent;
  }

  private _checkStreamClosed(): void {
    if (!this.xhr) {
      return;
    }

    if (this.xhr.readyState === XMLHttpRequest.DONE) {
      this._setReadyState(SSE.CLOSED);
    }
  }

  public stream = (): void => {
    if (this.xhr) {
      // Already connected.
      return;
    }

    this._setReadyState(SSE.CONNECTING);

    this.xhr = new XMLHttpRequest();
    this.xhr.addEventListener('progress', this._onStreamProgress.bind(this));
    this.xhr.addEventListener('load', this._onStreamLoaded.bind(this)); 
    this.xhr.addEventListener('readystatechange', this._checkStreamClosed.bind(this));
    this.xhr.addEventListener('error', this._onStreamFailure.bind(this));
    this.xhr.addEventListener('abort', this._onStreamAbort.bind(this));
    this.xhr.open(this.method, this.url);
    for (const header in this.headers) {
      this.xhr.setRequestHeader(header, this.headers[header]);
    }
    if (this.lastEventId.length > 0) {
      this.xhr.setRequestHeader("Last-Event-ID", this.lastEventId);
    }
    this.xhr.withCredentials = this.withCredentials;
    this.xhr.send(this.payload);
  };

  public close = (): void => {
    if (this.readyState === SSE.CLOSED) {
      return;
    }

    if (this.xhr) {
      this.xhr.abort();
      this.xhr = null;
    }

    this._setReadyState(SSE.CLOSED);
  };


}


export {SSE};