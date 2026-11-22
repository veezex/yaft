export function report(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function run(action: () => Promise<void>): void {
  action().catch(error => {
    console.error(JSON.stringify({ status: 'blocked', reason: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
  });
}

export const workRoot = process.env.YAFT_WORK_DIRECTORY ?? '.yaft';
