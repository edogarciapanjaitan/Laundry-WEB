import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import { DecodedToken } from '@/src/types/auth';
import GoogleProvider from 'next-auth/providers/google';
import FacebookProvider from 'next-auth/providers/facebook';

async function refreshAccessToken(token: any) {
  try {
    const { data } = await axios.post(
      `${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`,
      {
        refreshToken: token.refreshToken,
      }
    );

    const { accessToken, refreshToken } = data?.data;

    const decoded = jwtDecode<DecodedToken>(accessToken);

    return {
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
      accessToken,
      refreshToken,
      error: null,
    };
  } catch (err) {
    return {
      accessToken: null,
      refreshToken: null,
      email: null,
      name: null,
      role: null,
      error: 'RefreshTokenError',
    };
  }
}

const handler = NextAuth({
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email', required: true },
        password: { label: 'Password', type: 'password', required: true },
      },
      async authorize(credentials) {
        try {
          const { data } = await axios.post(
            `${process.env.NEXT_PUBLIC_API_URL}/auth/login`,
            {
              email: credentials?.email,
              password: credentials?.password,
            }
          );

          const { accessToken, refreshToken } = data?.data;

          if (!accessToken) {
            throw new Error('Invalid access token');
          }

          const decoded = jwtDecode<DecodedToken>(accessToken);

          return {
            id: decoded.email,
            email: decoded.email,
            name: decoded.name ?? '',
            role: decoded.role,
            accessToken,
            refreshToken,
          };
        } catch (err) {
          if (axios.isAxiosError(err)) {
            console.log(err.response?.data);
          }
          return null;
        }
      },
    }),

    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID || '',
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET || '',
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        return {
          ...token,
          accessToken: user.accessToken,
          refreshToken: user.refreshToken,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      }

      if (!token.accessToken) {
        return { ...token, error: 'InvalidAccessToken' };
      }

      let decoded: DecodedToken;
      try {
        decoded = jwtDecode<DecodedToken>(token.accessToken as string);
      } catch {
        return { ...token, error: 'InvalidAccessToken' };
      }

      const isExpired = decoded.exp * 1000 < Date.now();
      if (!isExpired) return token;

      return await refreshAccessToken(token);
    },

    async session({ session, token }) {
      if (
        !token ||
        token.error === 'RefreshTokenError' ||
        token.error === 'InvalidAccessToken'
      ) {
        return {
          ...session,
          user: null,
          accessToken: null,
          error: token?.error ?? 'SessionExpired',
          expires: session.expires,
        };
      }

      return {
        ...session,
        user: {
          email: token.email as string,
          name: token.name as string,
          role: token.role as string,
        },
        accessToken: token.accessToken as string,
        error: token.error ?? null,
      };
    },
  },
});
export { handler as GET, handler as POST };
