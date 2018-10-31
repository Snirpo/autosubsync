export class ArrayUtils {
    public static average(numbers: number[]) {
        return Math.floor(numbers.reduce((total, diff) => total + diff, 0) / numbers.length);
    }

    public static flatten(arr: any[]) {
        return arr.reduce((out: any[], curr: any[]) => [...out, ...curr], []);
    }

    public static groupBy(arr: any[], keyFn: (obj) => any, valueFn: (obj) => any) {
        return arr.reduce((map, obj) => {
            const key = keyFn(obj);
            const value = valueFn(obj);
            (map[key] = map[key] || []).push(value);
            return map;
        }, {});
    }

    public static sortBy(arr: any[], sortFn: (obj) => any) {
        return arr
            .map(obj => <any>{
                key: sortFn(obj),
                value: obj
            })
            .sort((a, b) => a.key - b.key)
            .map(obj => obj.value);
    }
}