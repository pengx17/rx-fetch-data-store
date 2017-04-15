import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { Observable } from 'rxjs';
import * as _ from 'lodash';

// Polyfill fetch
import 'whatwg-fetch';

import { FetchRequest } from './rx-fetch-data-store.d';

const INIT_VALUE_TOKEN = Symbol('__INIT_VALUE_TOKEN__');
const FETCH_START_TOKEN = Symbol('__FETCH_START_TOKEN__');
const SPECIAL_TOKENS = [INIT_VALUE_TOKEN, FETCH_START_TOKEN];

function isRequestInfo<T>(request: RequestInfo | FetchRequest<T>): request is RequestInfo {
  return (request instanceof String) || (request instanceof Object);
}

function isFetchRequest<T>(request: RequestInfo | FetchRequest<T>): request is FetchRequest<T> {
  return request instanceof Function;
}

export class RxFetchDataStore<T> {
  private request: FetchRequest<T>;
  private fetchSubject$: BehaviorSubject<T | Symbol | Error>;
  private _data$: Observable<T>;
  private _refetch: Function;
  private cached: T;

  constructor(uriOrRequest: RequestInfo | FetchRequest<T>) {
    this.fetchSubject$ = new BehaviorSubject(INIT_VALUE_TOKEN);
    
    if (isRequestInfo(uriOrRequest)) {
      uriOrRequest = () => fetch(uriOrRequest as RequestInfo).then(res => res.json() as Promise<T>);
    } else if (!isFetchRequest(uriOrRequest)) {
      throw new Error('Given argument is not a valid fetch function or not a request info');
    }

    this.request = uriOrRequest;

    // In case the refetch function is invoked too many times in a queue
    this._refetch = debounceFn(() => {
      this.fetchSubject$.next(FETCH_START_TOKEN);
      return this.request().then(data => {
        // Only cache when fetch success
        this.cached = data;
        this.fetchSubject$.next(data);
        return data;
      }).catch(error => {
        const wrappedError = new Error(error);
        this.fetchSubject$.next(wrappedError);
        return wrappedError;
      });
    }, 1);

    // The resource data will be fetched upon first subscription
    // Future subscriptions will firstly see the cached result.
    // Whenever refetch is called, new data will be returned.
    this._data$ = 
      Observable
        .merge(Observable.defer(() => this.refetch()), this.fetchSubject$)
        .map(data => ((data instanceof Error) || data instanceof Symbol) ? null : data)
        .map((data) => (data || this.cached)).distinctUntilChanged().publishReplay(1).refCount();
  }
  
  get data$(): Observable<T> {
    return this._data$;
  }
  
  refetch(): Promise<T> {
    return this._refetch();
  }
}

// Debounced promise:
// Like lodash.debounce, but multiple calls to a debounced function
// will return the same promise so that they will be notified when the debounced function returns
// 
// In case the deboucned value is a promise, the last promise value shall be returned. 
function debounceFn(fn: Function, timeout: number) {
  let timer: number = undefined;
  let resPromise: Promise<any> = undefined;
  let resolver: Function = undefined;
  let rejector: Function = undefined;
  return () => {
    if (timer) {
      // Cancel previous call
      clearTimeout(timer);
    }

    // Use native Promise as a defer object
    resPromise = resPromise || new Promise((_resolver, _rejector) => {
      resolver = _resolver;
      rejector = _rejector;
    });

    timer = setTimeout(() => {
      const invokingTimer = timer;
      // There is a case that when the return value of the function is a promise,
      // we should resolve to the last invoking one instead
      const shouldProceed = () => invokingTimer === timer;
      // In case fn returns a Promise,
      // we wrap it with resolve to make it compatible with a normal function return value
      const _fn = () => {
        try {
          return Promise.resolve(fn());
        } catch (err) {
          return Promise.reject(err);
        }
      }
      _fn().then(res => {
        if (shouldProceed()) {
          resolver(res);
        }
      }, err => {
        if (shouldProceed()) {
          rejector(err);
        }
      }).then(() => {
        if (shouldProceed()) {
          // Release resources
          resPromise = undefined;
          resolver = undefined;
          rejector = undefined;
          timer = undefined;
        }
      });
    }, timeout);
    return resPromise;
  };
}