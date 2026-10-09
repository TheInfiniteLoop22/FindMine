import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { photoUrlSchema, contactModeSchema, emailFieldSchema } from '@/lib/validation';

import { logger } from '@/lib/logger';

const registeredItemUpdateSchema = z.object({
  nickname: z.string().trim().min(1, 'Item nickname is required.').max(80, 'Nickname is too long.').optional(),
  category: z.string().trim().max(50, 'Category is too long.').nullable().optional(),
  photoUrl: photoUrlSchema.nullable().optional(),
  contactMode: contactModeSchema.optional(),
  status: z.enum(['ACTIVE', 'LOST_REPORTED']).optional(),
  email: emailFieldSchema.nullable().optional(),
});

// PATCH /api/registered-items/[id] - Update item info or status
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }

    const { id } = await params;

    const item = await prisma.registeredItem.findUnique({
      where: { id },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
    }

    if (item.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden. Owner only.' }, { status: 403 });
    }

    const body = await request.json();

    const parseResult = registeredItemUpdateSchema.safeParse(body);
    if (!parseResult.success) {
      logger.error('Zod validation error', { details: parseResult.error.flatten().fieldErrors });
      return NextResponse.json(
        {
          error: 'Validation failed',
          code: 'INVALID_INPUT',
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { nickname, category, photoUrl, contactMode, status, email } = parseResult.data;

    // Same rule as creation: contact info shown to a stranger who scans this
    // item must belong to the signed-in user. Only enforce it when the update
    // would actually result in that mode being active with an email set.
    const effectiveContactMode = contactMode !== undefined ? contactMode : item.contactMode;
    const effectiveEmail = email !== undefined ? email : item.email;

    // SHOW_PHONE is no longer a usable contact mode — the phone data model
    // backing it was removed. The enum value itself is kept only for
    // backward-compat with existing rows (see doc 13); reject switching to it.
    if (effectiveContactMode === 'SHOW_PHONE') {
      return NextResponse.json(
        {
          error: 'Phone contact mode is no longer supported.',
          code: 'CONTACT_MODE_UNSUPPORTED',
        },
        { status: 400 }
      );
    }

    if (effectiveContactMode === 'SHOW_EMAIL') {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { email: true },
      });

      if (!user?.email || user.email !== effectiveEmail) {
        return NextResponse.json(
          {
            error: 'Email address must match your own account email.',
            code: 'EMAIL_NOT_VERIFIED',
          },
          { status: 400 }
        );
      }
    }

    const dataToUpdate: Prisma.RegisteredItemUpdateInput = {};

    if (nickname !== undefined) dataToUpdate.nickname = nickname;
    if (category !== undefined) dataToUpdate.category = category || null;
    if (photoUrl !== undefined) dataToUpdate.photoUrl = photoUrl || null;
    if (email !== undefined) dataToUpdate.email = email || null;

    if (contactMode !== undefined) {
      dataToUpdate.contactMode = contactMode;
    }

    if (status !== undefined) {
      dataToUpdate.status = status;
      dataToUpdate.lostAt = status === 'LOST_REPORTED' ? new Date() : null;
    }

    const updatedItem = await prisma.registeredItem.update({
      where: { id },
      data: dataToUpdate,
    });

    return NextResponse.json({ data: updatedItem });
  } catch (error) {
    logger.error('Error updating registered item', { error });
    return NextResponse.json(
      { error: 'Failed to update registered item.' },
      { status: 500 }
    );
  }
}

// DELETE /api/registered-items/[id] - Delete a proactive registered item
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }

    const { id } = await params;

    const item = await prisma.registeredItem.findUnique({
      where: { id },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
    }

    if (item.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden. Owner only.' }, { status: 403 });
    }

    await prisma.registeredItem.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Item deleted successfully.' });
  } catch (error) {
    logger.error('Error deleting registered item', { error });
    return NextResponse.json(
      { error: 'Failed to delete registered item.' },
      { status: 500 }
    );
  }
}
