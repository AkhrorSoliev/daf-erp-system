import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchPeopleService } from './search-people.service';
import { SearchContentService } from './search-content.service';

@Module({
  controllers: [SearchController],
  providers: [SearchService, SearchPeopleService, SearchContentService],
})
export class SearchModule {}
