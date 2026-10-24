import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history/entity-history.service';
import { LeadsService } from '../leads/leads.service';
import {
  MetaFieldData,
  metaSourceName,
  parseMetaLead,
} from './meta-lead-ads.util';

const GRAPH_URL = 'https://graph.facebook.com/v21.0';

interface WebhookBody {
  entry?: { changes?: { field?: string; value?: { leadgen_id?: string } }[] }[];
}

interface GraphLead {
  field_data?: MetaFieldData[];
  platform?: string;
}

@Injectable()
export class MetaLeadAdsService {
  private readonly logger = new Logger(MetaLeadAdsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly leads: LeadsService,
    private readonly history: EntityHistoryService,
  ) {}

  private env(key: string): string {
    const value = this.config.get<string>(key);
    if (!value)
      throw new ServiceUnavailableException('Meta Lead Ads sozlanmagan');
    return value;
  }

  get appSecret() {
    return this.env('META_APP_SECRET');
  }

  get verifyToken() {
    return this.env('META_VERIFY_TOKEN');
  }

  /**
   * One lead at a time; a failure throws so Meta gets a 500 and retries the
   * whole delivery. `metaLeadId` makes the retry harmless for the ones that
   * already went through.
   */
  async handle(body: WebhookBody): Promise<void> {
    const ids = (body.entry ?? [])
      .flatMap((e) => e.changes ?? [])
      .filter((c) => c.field === 'leadgen' && c.value?.leadgen_id)
      .map((c) => c.value!.leadgen_id!);
    for (const id of ids) await this.importLead(id);
  }

  private async importLead(leadgenId: string): Promise<void> {
    const exists = await this.prisma.lead.findUnique({
      where: { metaLeadId: leadgenId },
      select: { id: true },
    });
    if (exists) return;

    const section = await this.prisma.leadSection.findFirst({
      where: { id: this.env('META_LEAD_SECTION_ID'), deletedAt: null },
      select: { id: true, companyId: true },
    });
    if (!section)
      throw new ServiceUnavailableException("Meta lidlar bo'limi topilmadi");

    const graph = await this.fetchLead(leadgenId);
    const parsed = parseMetaLead(graph.field_data ?? []);
    if (!parsed) {
      this.logger.warn(`Meta lead ${leadgenId} skipped: no usable name/phone`);
      return;
    }

    const sourceId = await this.findOrCreateSource(
      metaSourceName(graph.platform),
      section.companyId,
    );
    try {
      await this.leads.create(
        { ...parsed, sectionId: section.id, sourceId, metaLeadId: leadgenId },
        section.companyId,
        { kind: 'meta-lead-ads' },
      );
    } catch (err) {
      // A concurrent delivery of the same lead won the unique key.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return;
      }
      throw err;
    }
  }

  private async fetchLead(leadgenId: string): Promise<GraphLead> {
    const url =
      `${GRAPH_URL}/${encodeURIComponent(leadgenId)}` +
      `?fields=field_data,platform&access_token=${encodeURIComponent(this.env('META_PAGE_TOKEN'))}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    // The URL carries the token — never log it, only the status.
    if (!res.ok) throw new Error(`Meta Graph API answered ${res.status}`);
    return (await res.json()) as GraphLead;
  }

  private async findOrCreateSource(
    name: string,
    companyId: number,
  ): Promise<string> {
    const existing = await this.prisma.leadSource.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        deletedAt: null,
        companyId,
      },
      select: { id: true },
    });
    if (existing) return existing.id;

    const maxOrder = await this.prisma.leadSource.aggregate({
      where: { deletedAt: null, companyId },
      _max: { order: true },
    });
    const created = await this.prisma.leadSource.create({
      data: { name, order: (maxOrder._max.order ?? -1) + 1, companyId },
      select: { id: true, name: true },
    });
    await this.history.recordCreate({
      entityType: 'LeadSource',
      entityId: created.id,
      newValues: { name: created.name },
      changedById: undefined,
      companyId,
    });
    return created.id;
  }
}
