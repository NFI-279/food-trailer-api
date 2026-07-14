import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    
    // If there is no @Roles() tag, let them in (the JwtGuard still protects it!)
    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    // If the user's role isn't in the required list, instantly block them!
    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException('You do not have permission (Admin Role Required).');
    }

    return true;
  }
}
