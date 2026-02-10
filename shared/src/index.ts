export interface User {
  id: string;
  email: string;
  full_name?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface ApiError {
  message: string;
  code?: number;
}