export type RequestToken = number;

/** Makes completion of older asynchronous work explicitly ignorable. */
export class LatestRequest {
    private generation = 0;

    begin(): RequestToken {
        this.generation += 1;
        return this.generation;
    }

    cancel(): void {
        this.generation += 1;
    }

    isCurrent(token: RequestToken): boolean {
        return token === this.generation;
    }
}

export class RequestCache<T> {
    private readonly values = new Map<string, T>();

    get(key: string): T | undefined {
        return this.values.get(key);
    }

    set(key: string, value: T): void {
        this.values.set(key, value);
    }

    clear(): void {
        this.values.clear();
    }
}
