

export interface User {
  id: string;
  name: string;
}


export const predefinedUsers: User[] = [
  { id: 'user1', name: 'Alice' },
  { id: 'user2', name: 'Bob' },
  { id: 'user3', name: 'Charlie' },
];  

export interface ScriptSection {
  title: string;
  writingInstructions: string;
  image_generation_prompt: string;
}

