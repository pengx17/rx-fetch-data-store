import { Observable } from 'rxjs/Observable';

declare type FetchRequest<T> = () => Promise<T>;
declare class RxFetchDataStore<T> {
  constructor(uriOrRequest: string | FetchRequest<T>);
  data$: Observable<T | undefined>;
  
  refetch(): Promise<T>;
}
