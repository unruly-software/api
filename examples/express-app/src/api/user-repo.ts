export interface UserRepo {
  get(id: number): Promise<{ id: number; name: string; email: string } | null>;

  create(data: {
    name: string;
    email: string;
  }): Promise<{ id: number; name: string; email: string }>;
}

let singleton: UserRepo | null = null;
export class InMemoryUserRepo implements UserRepo {
  private users: { id: number; name: string; email: string }[] = [];
  private nextId = 1;

  static getSingleton(): UserRepo {
    if (!singleton) {
      singleton = new InMemoryUserRepo();
    }
    return singleton;
  }

  async get(
    id: number,
  ): Promise<{ id: number; name: string; email: string } | null> {
    const user = this.users.find((u) => u.id === id);
    return user || null;
  }

  async create(data: {
    name: string;
    email: string;
  }): Promise<{ id: number; name: string; email: string }> {
    const newUser = { id: this.nextId++, ...data };
    this.users.push(newUser);
    return newUser;
  }
}
