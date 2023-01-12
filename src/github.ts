import jwt_decode, {JwtPayload} from 'jwt-decode';

interface Jwt extends JwtPayload {
  ac?: string;
}

export const parseRuntimeToken = (token: string): Jwt => {
  return jwt_decode<Jwt>(token);
};
