export class ObjectUtils {
    public static values(obj: any) {
        return Object.keys(obj).map(key => obj[key]);
    }
}