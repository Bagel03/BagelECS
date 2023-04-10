export function awaitMessage<T = any>(
    worker: Worker,
    messageType: any
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        function listen({ data }: MessageEvent<any>) {
            if (data.type === messageType) {
                worker.removeEventListener("message", listen);
                resolve(data);
            }
        }

        worker.addEventListener("message", listen);
    });
}
