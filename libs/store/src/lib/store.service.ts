import { Inject, Injectable, OnDestroy, Optional, SkipSelf } from "@angular/core"
import { asapScheduler, BehaviorSubject, Observable, Subject } from "rxjs"
import { distinctUntilChanged, map, publishReplay, throttleTime } from "rxjs/operators"
import { produce } from "immer"
import { STORE_ACTIONS_OBSERVER, STORE_FEATURE, STORE_INITIAL_STATE } from "./constants"
import { Action, Computed, Feature, InitialStateGetter, StateSetter, StoreLike } from "./interfaces"
import { defaultMemoize, Selector } from "reselect"
import { select } from "./operators"
import { compute, isRecipe, OfType } from "./utils"

export function createFeatureSelector<T>(name?: string): (state: any) => T {
    // istanbul ignore next
    return defaultMemoize(state => (state && name ? state[name] : state) || {})
}

@OfType("SET_STATE")
export class SetState {
    constructor(public payload: any) {}
}

@Injectable()
export class Store<T> extends Observable<T> implements StoreLike<T>, OnDestroy {
    public readonly initialState: T

    private readonly feature: Feature
    private readonly state$: BehaviorSubject<T>
    private readonly destroyed$: Subject<void>
    private readonly actions$: Subject<Action>
    private readonly parent: Store<any>
    private readonly computed: Computed<T>

    constructor(
        @Inject(STORE_FEATURE) feature: Feature,
        @Inject(STORE_INITIAL_STATE) getInitialState: InitialStateGetter<T>,
        @Inject(STORE_ACTIONS_OBSERVER) actions: Subject<any>,
        @Optional() @SkipSelf() parent?: Store<any>,
    ) {
        let sub: Observable<T>

        super(subscriber => sub.subscribe(subscriber))

        const stateConfig = getInitialState()
        const initialState: T = {} as T
        const computed: any = {}

        Object.getOwnPropertyNames(stateConfig).forEach(key => {
            const value = stateConfig[key]
            if (typeof value === "function") {
                computed[key] = value
                initialState[key] = null
            } else {
                initialState[key] = value as any
            }
        })

        this.computed = computed
        this.initialState = initialState
        this.feature = feature
        this.parent = parent
        this.state$ = new BehaviorSubject(initialState)
        this.destroyed$ = new Subject()
        this.actions$ = actions

        if (this.parent) {
            this.state$.subscribe(state => {
                this.parent.setState({
                    [this.feature]: state,
                })
            })

            sub = this.parent.state$.pipe(
                throttleTime(0, asapScheduler),
                select(createFeatureSelector(this.feature)),
            )
        } else {
            sub = this.state$.pipe(
                throttleTime(0, asapScheduler),
                distinctUntilChanged(),
            )
        }

        compute(this, this.state$, this.computed).subscribe()
    }

    public get state(): T {
        return this.state$.getValue()
    }

    public ngOnDestroy() {
        this.state$.complete()
        this.destroyed$.complete()
    }

    public select<R>(selector: Selector<T, R>) {
        return this.pipe(select(selector))
    }

    public dispatch(action: any) {
        this.actions$.next(action)
    }

    public setState(setter: StateSetter<T>) {
        let state: T

        if (isRecipe<T>(setter)) {
            state = produce(this.state, setter)
        } else {
            state = produce(this.state, (draft: T) => Object.assign(draft, setter))
        }

        this.state$.next(state)

        this.dispatch(new SetState(state))
    }
}

export function provideStore(feature: string, initialState: any) {
    return [
        {
            provide: Store,
            useClass: Store,
            deps: [
                STORE_FEATURE,
                STORE_INITIAL_STATE,
                STORE_ACTIONS_OBSERVER,
                [Store, new Optional(), new SkipSelf()],
            ],
        },
        {
            provide: STORE_FEATURE,
            useValue: feature,
        },
        {
            provide: STORE_INITIAL_STATE,
            useValue: initialState,
        },
    ]
}
