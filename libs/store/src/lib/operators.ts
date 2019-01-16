import { Selector } from "reselect"
import { Observable } from "rxjs"
import { distinctUntilChanged, map, skip, switchMap, take, tap } from "rxjs/operators"
import { Type } from "@angular/core"
import { StateSetter, StateSetterWithContext, StoreLike } from "./interfaces"

export function OfType<T extends { new (...args: any[]): {} }>(type: string) {
    return function(constructor) {
        return class extends constructor {
            static type = type
            type = type

            constructor(...args: any[]) {
                super(...args)
            }
        } as typeof constructor
    }
}

export function select<T, R>(
    selector: Selector<T, R>,
): (source$: Observable<StoreLike<T>>) => Observable<R> {
    return function(source$) {
        return source$.pipe(
            map(store => selector(store.state)),
            distinctUntilChanged(),
        )
    }
}

export function watch<T, R>(
    selector: Selector<T, R>,
): (store: Observable<StoreLike<T>>) => Observable<R> {
    return function(source$) {
        return source$.pipe(
            select(selector),
            skip(1),
        )
    }
}

export function isRecipe<T>(setter): setter is (draft: T) => any {
    return typeof setter === "function"
}

export function ofAction<T extends Observable<any>, U>(
    store: StoreLike<any>,
    actionType: Type<U>,
): (source$: T) => Observable<U>
export function ofAction<T extends StoreLike<any>, U>(
    actionType: Type<U>,
): (source$: Observable<T>) => Observable<U>
export function ofAction(actionType: any): (source$: Observable<any>) => Observable<any> {
    const actionArg = arguments[arguments.length - 1]
    const storeArg = arguments[arguments.length - 2]

    return function(source$) {
        if (storeArg) {
            return storeArg.ofAction(actionArg)
        } else {
            return source$.pipe(
                take(1),
                switchMap(source =>
                    source.ofAction(actionArg)
                ),
            )
        }
    }
}

export function dispatch<T>(
    store: StoreLike<T>,
    action: any | ((store: StoreLike<T>) => any),
): (source$: Observable<StoreLike<T>>) => Observable<StoreLike<T>>
export function dispatch<T>(
    action: any | ((store: StoreLike<T>) => any),
): (source$: Observable<StoreLike<T>>) => Observable<StoreLike<T>> {
    return function(source$) {
        return source$.pipe(
            tap(store => {
                const value = typeof action === "function" ? action(store) : action
                store.dispatch(value)
            }),
        )
    }
}

export function toState<T>(): (source$: Observable<StoreLike<T>>) => Observable<T> {
    const storeArg: StoreLike<T> | undefined = arguments[arguments.length - 1]

    return function(source$) {
        return source$.pipe(
            map(source => {
                const store = storeArg || source
                return store.state
            }),
        )
    }
}

export function withLatestState<T, U>(
    store: StoreLike<T>,
): (source$: Observable<U>) => Observable<[U, T]>
export function withLatestState<T extends StoreLike<U>, U>(): (
    source$: Observable<T>,
) => Observable<[StoreLike<U>, U]> {
    const storeArg: T | undefined = arguments[arguments.length - 1]

    return function(source$) {
        return source$.pipe(
            map<T, [T, U]>(source => {
                const store = storeArg || source
                return [source, store.state]
            }),
        )
    }
}

export function withStoreLike<T, U>(
    store: StoreLike<T>,
): (source$: Observable<U>) => Observable<[U, StoreLike<T>]> {
    return function(source$) {
        return source$.pipe(map<U, [U, StoreLike<T>]>(source => [source, store]))
    }
}

export function setState<T extends StoreLike<any>, U>(
    setter: StateSetter<U>,
): (source$: StoreLike<U>) => StoreLike<U>
export function setState<T extends Observable<V>, U, V>(
    store: StoreLike<U>,
    setter: StateSetterWithContext<U, V>,
): (source$: Observable<V>) => Observable<V>
export function setState(setter: any): (source$: any) => any {
    const setterArg = arguments[arguments.length - 1]
    const storeArg = arguments[arguments.length - 2]

    return function(source$) {
        return source$.pipe(
            tap(source => {
                const store = storeArg || source
                let stateSetter = setterArg

                if (typeof setterArg === "function") {
                    stateSetter = storeArg ? setterArg.bind(null, source) : setterArg
                }

                store.setState(stateSetter)
            }),
        )
    }
}

export function compute<T, R>(
    selector: Selector<T, R>,
    fn: StateSetterWithContext<T, R>,
): (store: StoreLike<T>) => Observable<R> {
    return function(store) {
        return store.pipe(
            select(selector),
            setState(store, fn),
        )
    }
}
