import type { Post } from './types.js';

export interface PostRepo {
  getAll(): Promise<Post[]>;
  getById(id: number): Promise<Post | null>;
  create(data: Omit<Post, 'id'>): Promise<Post>;
}

// Sample seed data
const SEED_POSTS: Post[] = [
  {
    userId: 1,
    id: 1,
    title:
      'sunt aut facere repellat provident occaecati excepturi optio reprehenderit',
    body: 'quia et suscipit\nsuscipit recusandae consequuntur expedita et cum\nreprehenderit molestiae ut ut quas totam\nnostrum rerum est autem sunt rem eveniet architecto',
  },
  {
    userId: 1,
    id: 2,
    title: 'qui est esse',
    body: 'est rerum tempore vitae\nsequi sint nihil reprehenderit dolor beatae ea dolores neque\nfugiat blanditiis voluptate porro vel nihil molestiae ut reiciendis\nqui aperiam non debitis possimus qui neque nisi nulla',
  },
  {
    userId: 2,
    id: 3,
    title: 'ea molestias quasi exercitationem repellat qui ipsa sit aut',
    body: 'et iusto sed quo iure\nvoluptatem occaecati omnis eligendi aut ad\nvoluptatem doloribus vel accusantium quis pariatur\nmolestiae porro eius odio et labore et velit aut',
  },
];

let singleton: PostRepo | null = null;
export class InMemoryPostRepo implements PostRepo {
  private posts: Post[] = [...SEED_POSTS];
  private nextId = 4;

  static getSingleton(): PostRepo {
    if (!singleton) {
      singleton = new InMemoryPostRepo();
    }
    return singleton;
  }

  async getAll(): Promise<Post[]> {
    return [...this.posts];
  }

  async getById(id: number): Promise<Post | null> {
    const post = this.posts.find((p) => p.id === id);
    return post || null;
  }

  async create(data: Omit<Post, 'id'>): Promise<Post> {
    const newPost: Post = { id: this.nextId++, ...data };
    this.posts.push(newPost);
    return newPost;
  }
}
