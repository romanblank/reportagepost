import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { InquiryError, createInquiry, inquiriesForPhotographer } from '@/lib/inquiries';
import { clientIp, rateLimit } from '@/lib/rate-limit';

const InquirySchema = z.object({
  contactName: z.string().trim().min(2).max(100),
  contactPhone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'E.164').optional(),
  contactEmail: z.string().trim().toLowerCase().email().optional(),
  citySlug: z.string().trim(),
  categorySlug: z.string().trim().optional(),
  eventDate: z.iso.date().optional(), // YYYY-MM-DD
  budgetMinor: z.number().int().min(0).optional(),
  description: z.string().trim().min(20).max(3000),
  website: z.string().max(0).optional(), // honeypot: боты заполняют — люди не видят
});

// Публичная форма заявки (гость или залогиненный клиент)
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = InquirySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const session = await getSession();
  // Публичный POST рассылает уведомления фотографам города — жёсткий лимит
  // против спам-рассыла через нашу инфраструктуру (аудит P1 #3): 3/час на IP
  try {
    await rateLimit(`inquiry:ip:${clientIp(req)}`, 3, 3600);
  } catch {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  try {
    const result = await createInquiry({
      clientUserId: session?.userId,
      contactName: parsed.data.contactName,
      contactPhone: parsed.data.contactPhone,
      contactEmail: parsed.data.contactEmail,
      citySlug: parsed.data.citySlug,
      categorySlug: parsed.data.categorySlug,
      eventDate: parsed.data.eventDate ? new Date(`${parsed.data.eventDate}T00:00:00Z`) : undefined,
      budgetMinor: parsed.data.budgetMinor,
      description: parsed.data.description,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof InquiryError) {
      return NextResponse.json({ error: e.code }, { status: 400 });
    }
    throw e;
  }
}

// Лента заявок для одобренного фотографа (его город)
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (session.role !== 'PHOTOGRAPHER') {
    return NextResponse.json({ error: 'photographers_only' }, { status: 403 });
  }

  const inquiries = await inquiriesForPhotographer(session.userId);
  if (inquiries === null) {
    return NextResponse.json({ error: 'profile_not_approved' }, { status: 403 });
  }
  return NextResponse.json({
    inquiries: inquiries.map((i) => ({
      id: i.id,
      contactName: i.contactName,
      // контакты открываем: сделка происходит вне платформы (модель MyWed)
      contactPhone: i.contactPhone,
      contactEmail: i.contactEmail,
      citySlug: i.city.slug,
      categorySlug: i.category?.slug ?? null,
      eventDate: i.eventDate,
      budgetMinor: i.budgetMinor,
      description: i.description,
      createdAt: i.createdAt,
    })),
  });
}
