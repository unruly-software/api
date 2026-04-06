import type { User } from './types.js';

export interface UserRepo {
  getAll(): Promise<User[]>;
  getById(id: number): Promise<User | null>;
  create(data: Omit<User, 'id'>): Promise<User>;
}

// Sample seed data to make the server more interesting
const SEED_USERS: User[] = [
  {
    id: 1,
    name: 'Leanne Graham',
    username: 'Bret',
    email: 'sincere@april.biz',
    address: {
      street: 'Kulas Light',
      suite: 'Apt. 556',
      city: 'Gwenborough',
      zipcode: '92998-3874',
      geo: {
        lat: '-37.3159',
        lng: '81.1496',
      },
    },
    phone: '1-770-736-8031 x56442',
    website: 'hildegard.org',
    company: {
      name: 'Romaguera-Crona',
      catchPhrase: 'Multi-layered client-server neural-net',
      bs: 'harness real-time e-markets',
    },
  },
  {
    id: 2,
    name: 'Ervin Howell',
    username: 'Antonette',
    email: 'shanna@melissa.tv',
    address: {
      street: 'Victor Plains',
      suite: 'Suite 879',
      city: 'Wisokyburgh',
      zipcode: '90566-7771',
      geo: {
        lat: '-43.9509',
        lng: '-34.4618',
      },
    },
    phone: '010-692-6593 x09125',
    website: 'anastasia.net',
    company: {
      name: 'Deckow-Crist',
      catchPhrase: 'Proactive didactic contingency',
      bs: 'synergize scalable supply-chains',
    },
  },
];

let singleton: UserRepo | null = null;
export class InMemoryUserRepo implements UserRepo {
  private users: User[] = [...SEED_USERS];
  private nextId = 3;

  static getSingleton(): UserRepo {
    if (!singleton) {
      singleton = new InMemoryUserRepo();
    }
    return singleton;
  }

  async getAll(): Promise<User[]> {
    return [...this.users];
  }

  async getById(id: number): Promise<User | null> {
    const user = this.users.find((u) => u.id === id);
    return user || null;
  }

  async create(data: Omit<User, 'id'>): Promise<User> {
    const newUser: User = { id: this.nextId++, ...data };
    this.users.push(newUser);
    return newUser;
  }
}
