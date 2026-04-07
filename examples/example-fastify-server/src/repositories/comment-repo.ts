import type { Comment } from './types.js';

export interface CommentRepo {
  getAll(): Promise<Comment[]>;
  getById(id: number): Promise<Comment | null>;
  getByPostId(postId: number): Promise<Comment[]>;
  create(data: Omit<Comment, 'id'>): Promise<Comment>;
}

// Sample seed data
const SEED_COMMENTS: Comment[] = [
  {
    postId: 1,
    id: 1,
    name: 'id labore ex et quam laborum',
    email: 'eliseo@gardner.biz',
    body: 'laudantium enim quasi est quidem magnam voluptate ipsam eos\ntempora quo necessitatibus\ndolor quam autem quasi\nreiciendis et nam sapiente accusantium',
  },
  {
    postId: 1,
    id: 2,
    name: 'quo vero reiciendis velit similique earum',
    email: 'jayne_kuhic@sydney.com',
    body: 'est natus enim nihil est dolore omnis voluptatem numquam\net omnis occaecati quod ullam at\nvoluptatem error expedita pariatur\nnihil sint nostrum voluptatem reiciendis et',
  },
  {
    postId: 2,
    id: 3,
    name: 'odio adipisci rerum aut animi',
    email: 'nikita@garfield.biz',
    body: 'quia molestiae reprehenderit quasi aspernatur\naut expedita occaecati aliquam eveniet laudantium\nomnis quibusdam delectus saepe quia accusamus maiores nam est\ncum et ducimus et vero voluptates excepturi deleniti ratione',
  },
  {
    postId: 2,
    id: 4,
    name: 'alias odio sit',
    email: 'llewellyn@yolanda.me',
    body: 'non et atque\noccaecati deserunt quas accusantium unde odit nobis qui voluptatem\nquia voluptas consequuntur itaque dolor\net qui rerum deleniti ut occaecati',
  },
];

let singleton: CommentRepo | null = null;
export class InMemoryCommentRepo implements CommentRepo {
  private comments: Comment[] = [...SEED_COMMENTS];
  private nextId = 5;

  static getSingleton(): CommentRepo {
    if (!singleton) {
      singleton = new InMemoryCommentRepo();
    }
    return singleton;
  }

  async getAll(): Promise<Comment[]> {
    return [...this.comments];
  }

  async getById(id: number): Promise<Comment | null> {
    const comment = this.comments.find((c) => c.id === id);
    return comment || null;
  }

  async getByPostId(postId: number): Promise<Comment[]> {
    return this.comments.filter((c) => c.postId === postId);
  }

  async create(data: Omit<Comment, 'id'>): Promise<Comment> {
    const newComment: Comment = { id: this.nextId++, ...data };
    this.comments.push(newComment);
    return newComment;
  }
}
