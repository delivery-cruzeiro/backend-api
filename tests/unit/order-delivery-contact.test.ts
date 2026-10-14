import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), getStatus: vi.fn() }));
vi.mock('../../src/lib/prisma.js', () => ({ prisma: { order: { findFirst: mocks.findFirst } } }));
vi.mock('../../src/integrations/whatsapp/whatsapp.factory.js', () => ({ getWhatsAppService: () => ({ getStatus: mocks.getStatus }) }));
import { getClientOrderContact } from '../../src/controllers/client.controller.js';

describe('contato do pedido', () => {
 const request = { user: { id: 'owner' }, params: { id: 'order' } };
 function reply() { const response = { send: vi.fn(), status: vi.fn(), header: vi.fn() }; response.status.mockReturnValue(response); return response; }
 beforeEach(() => vi.resetAllMocks());
 it('não consulta a conexão nem expõe telefone de pedido de outro cliente', async () => {
  mocks.findFirst.mockResolvedValue(null);
  const response = reply();
  await getClientOrderContact(request as never, response as never);
  expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'order', userId: 'owner' } }));
  expect(response.status).toHaveBeenCalledWith(404);
  expect(mocks.getStatus).not.toHaveBeenCalled();
 });
 it('consulta o número atual a cada abertura sem cache', async () => {
  mocks.findFirst.mockResolvedValue({ id: 'order' });
  mocks.getStatus.mockResolvedValueOnce({ connected: true, phone: '+55 (11) 99999-0000' }).mockResolvedValueOnce({ connected: true, phone: '+55 (21) 98888-0000' });
  const response = reply();
  await getClientOrderContact(request as never, response as never);
  expect(response.send).toHaveBeenLastCalledWith({ phone: '5511999990000' });
  await getClientOrderContact(request as never, response as never);
  expect(response.send).toHaveBeenLastCalledWith({ phone: '5521988880000' });
  expect(response.header).toHaveBeenCalledWith('Cache-Control', 'no-store');
 });
 it('não usa número antigo quando desconectado', async () => {
  mocks.findFirst.mockResolvedValue({ id: 'order' });
  mocks.getStatus.mockResolvedValue({ connected: false, phone: '5511999990000' });
  const response = reply();
  await getClientOrderContact(request as never, response as never);
  expect(response.send).toHaveBeenCalledWith({ phone: null });
 });
});
