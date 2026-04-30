export type MasterListField = {
      id: string;
      label: string;
      type: 'text' | 'number' | 'boolean' | 'date';
    };
export type MasterList = {
      id: string;
      name: string;
      description: string;
      primaryKey: string;
      fields: MasterListField[];
    };
