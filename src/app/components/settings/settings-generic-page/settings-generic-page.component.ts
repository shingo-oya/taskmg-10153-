import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-settings-generic-page',
  standalone: true,
  templateUrl: './settings-generic-page.component.html',
  styleUrl: './settings-generic-page.component.scss',
})
export class SettingsGenericPageComponent {
  private readonly route = inject(ActivatedRoute);

  readonly pageTitle = this.route.snapshot.data['pageTitle'] as string;
}
