import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  let service: OrdersService;
  const customerToken = 'a'.repeat(64);
  const prisma = {
    order: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'local-stripe-placeholder';
    service = new OrdersService(prisma as never);
    jest.clearAllMocks();
  });

  it('requires a customer capability token to read order status', async () => {
    prisma.order.findUnique.mockResolvedValue({
      customerAccessTokenHash: createHash('sha256')
        .update(customerToken)
        .digest('hex'),
    });

    await expect(service.getStatusById('order-id')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('accepts the capability token for order status', async () => {
    prisma.order.findUnique
      .mockResolvedValueOnce({
        customerAccessTokenHash: createHash('sha256')
        .update(customerToken)
        .digest('hex'),
      })
      .mockResolvedValueOnce({
        id: 'order-id',
        orderNumber: '001-AA',
        status: 'UNPAID',
        totalAmount: 10,
        updatedAt: new Date(),
      });

    await expect(
      service.getStatusById('order-id', customerToken),
    ).resolves.toMatchObject({ id: 'order-id' });
  });
});
