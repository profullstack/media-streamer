export class VodError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'VodError';
    this.status = status;
  }
}
