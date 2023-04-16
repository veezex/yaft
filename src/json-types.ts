// metaGroups

export type MetaGroupsFile = Record<string, MetaGroups>

export interface MetaGroups {
    nameID:         ID;
    iconID?:        number;
    iconSuffix?:    string;
    descriptionID?: ID;
}

export interface ID {
    de: string;
    en: string;
    es: string;
    fr: string;
    ja: string;
    ko: string;
    ru: string;
    zh: string;
}


