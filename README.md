# Rx Fetch Data Store
Wraps html5 fetch endpoint with RxJS to enable better user experience with cache

## API:

The Fetch Data Store is encapsulated in class `RxFetchDataStore<T>`.

### Constructor
```ts
constructor(resourceURI: string | () => Promise<T>)
```

**resourceUri:** A function whose return value is a promise of type T.
For example, you can pass in a request function like this:
