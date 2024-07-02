export abstract class VersionedExecutor<T, V = number> {
    private versionedData?: VersionedData<T, V>;
    private versionedPromise?: VersionedPromise<T, V>;

    protected abstract execute(): Promise<T>;

    protected isGreaterOrEqual(v1: V, v2: V): boolean {
        return v1 >= v2;
    }

    public async getResult(version: V): Promise<T> {
        if (this.versionedData && this.isGreaterOrEqual(this.versionedData.version, version)) {
            return this.versionedData.data;
        } else if (this.versionedPromise && this.isGreaterOrEqual(this.versionedPromise.version, version)) {
            return this.versionedPromise.promise;
        } else {
            return this.startExecution(version);
        }
    }

    private startExecution(version: V): Promise<T> {
        const vp: VersionedPromise<T, V> = {
            version,
            promise: this.execute(),
        };
        this.versionedPromise = vp;
        vp.promise.then((data) => {
            this.updateVersionedData(vp, data);
        });
        return vp.promise;
    }

    private updateVersionedData(vp: VersionedPromise<T, V>, data: T): void {
        if (!this.versionedData || !this.isGreaterOrEqual(this.versionedData.version, vp.version)) {
            this.versionedData = {
                version: vp.version,
                data,
            };
        }
    }
}

interface VersionedData<T, V> {
    version: V;
    data: T;
}

interface VersionedPromise<T, V> {
    version: V;
    promise: Promise<T>;
}
