declare module "htmldiff-js" {
  const htmldiff: {
    execute(before: string, after: string): string;
  };
  export default htmldiff;
}
