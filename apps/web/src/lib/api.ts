import axios from 'axios';
import { useAuthStore } from '@/store/auth.store';

export const api = axios.create({
  baseURL:
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:3000/api',
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});