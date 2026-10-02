declare module 'astro:content' {
  export const z: {
    object: (schema: any) => any;
    string: () => any;
    number: () => any;
    boolean: () => any;
    enum: (values: string[]) => any;
    array: (inner: any) => any;
    coerce: { date: () => any };
  };

  export function defineCollection<T>(config: T): T;
  export function getCollection(name: string): Promise<any[]>;
}

declare module 'astro/config' {
  export function defineConfig(config: any): any;
}

declare module '@astrojs/tailwind' {
  export default function tailwind(): any;
}

declare module '@astrojs/react' {
  export default function react(): any;
}

declare module '@astrojs/sitemap' {
  export default function sitemap(): any;
}
